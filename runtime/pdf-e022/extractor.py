"""Frontera Mortara local: solo extracción numérica permitida; nunca serializa DocumentoParseado."""
import base64
import binascii
from http.server import BaseHTTPRequestHandler, HTTPServer
from io import BytesIO
import json
import math
import re
import signal
import uuid

import numpy as np
import pymupdf
from anonimizacion.dominio.errores import ErrorParseo
from anonimizacion.extraccion.texto_pymupdf import extraer_texto_de_flujo
from anonimizacion.extraccion.trazos_pymupdf import capturar_trazos
from anonimizacion.parseo.ecg_mortara import ParseadorEcgMortara

CONTRACT = 'mortara-extraction.v1'
SOURCE = 'git:4ff99ce97a42ff32a47268996f3cedcdabe70c1c'
LEADS = ('I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6')
MAX_PDF = 2 * 1024 * 1024
MAX_REQUEST = 3 * 1024 * 1024
MAX_RESPONSE = 4 * 1024 * 1024
pymupdf.TOOLS.mupdf_display_errors(False)
pymupdf.TOOLS.mupdf_display_warnings(False)


class Rejected(ValueError):
    pass


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise Rejected('PDF_INVALID')
        result[key] = value
    return result


def decode_request(raw):
    if not 0 < len(raw) <= MAX_REQUEST:
        raise Rejected('PDF_INVALID')
    try:
        body = json.loads(raw.decode('utf-8'), object_pairs_hook=no_duplicates)
        if not isinstance(body, dict) or set(body) != {'contract', 'pdfBase64', 'requestId'} or body['contract'] != CONTRACT:
            raise ValueError()
        if not isinstance(body['requestId'], str) or str(uuid.UUID(body['requestId'])) != body['requestId']:
            raise ValueError()
        encoded = body['pdfBase64']
        if not isinstance(encoded, str) or not 0 < len(encoded) <= ((MAX_PDF + 2) // 3) * 4:
            raise ValueError()
        data = base64.b64decode(encoded, validate=True)
        if base64.b64encode(data).decode('ascii') != encoded or not 0 < len(data) <= MAX_PDF:
            raise ValueError()
        return data
    except (ValueError, TypeError, KeyError, UnicodeError, binascii.Error, RecursionError):
        raise Rejected('PDF_INVALID') from None


def number(value, *, qtc=False):
    # Misma selección de QTc que pdf_adapter.py; no imputa ni estandariza.
    if value is None:
        return None
    text = str(value)
    if qtc and '/' in text:
        text = text.split('/', 1)[1]
    match = re.search(r'[+-]?\d+(?:[.,]\d+)?', text)
    result = float(match[0].replace(',', '.')) if match else None
    if result is not None and not math.isfinite(result):
        raise Rejected('PDF_INCOMPLETE')
    return result


def extract(data):
    if not isinstance(data, bytes) or not 0 < len(data) <= MAX_PDF or not data.startswith(b'%PDF-'):
        raise Rejected('PDF_INVALID')
    # Preflight acota páginas/protección antes de capturar geometría. ParseadorEcgMortara corre UNA vez.
    try:
        with pymupdf.open(stream=data, filetype='pdf') as doc:
            if doc.needs_pass:
                raise Rejected('PDF_PROTECTED')
            if doc.page_count != 1:
                raise Rejected('PDF_UNSUPPORTED')
    except Rejected:
        raise
    except Exception:
        raise Rejected('PDF_INVALID') from None
    rejection_code = 'PDF_UNSUPPORTED'
    try:
        text = extraer_texto_de_flujo(BytesIO(data), capturador_para=lambda _: capturar_trazos)
        # El encabezado conserva la clasificación del error, no prueba compatibilidad.
        # La aceptación exige el parser fijado y todos los controles de señal siguientes.
        if re.search(r'\bMORTARA\s+ELI\s+380\b', text.texto_completo.upper()):
            rejection_code = 'PDF_INCOMPLETE'
        document = ParseadorEcgMortara().parsear(text)
    except ErrorParseo:
        raise Rejected(rejection_code) from None
    content = document.contenido
    sig = content.senal
    if sig is None or sig.frecuencia_hz != 500 or sig.version_extractor != 2:
        raise Rejected(rejection_code)
    wave, mask = np.asarray(sig.muestras_uv), np.asarray(sig.mascara)
    if wave.shape != (12, 5000) or wave.dtype != np.int16 or mask.shape != wave.shape or mask.dtype != bool or not mask.any():
        raise Rejected(rejection_code)
    if np.any(wave[~mask] != 0) or np.ptp(wave[mask].astype(float)) == 0:
        raise Rejected(rejection_code)
    # Lista positiva: no identidad, fecha, fuentes, institución ni todos los adicionales.
    def measure(value, unit, **kwargs):
        return {'value': number(value, **kwargs), 'unit': unit}
    return {'contract': CONTRACT, 'extractorVersion': '2', 'sourceReference': SOURCE,
        'samplingHz': 500, 'unit': 'uV',
        'leads': [{'name': name, 'samples': wave[i].tolist(), 'observed': mask[i].tolist()} for i, name in enumerate(LEADS)],
        'measurements': {'sex': {'Male': 'male', 'Female': 'female'}.get(document.adicionales.get('sexo')),
            'age': measure(document.adicionales.get('edad'), 'years'),
            'ventricular_rate': measure(content.vent_rate, 'bpm'), 'atrial_rate': measure(None, 'bpm'),
            'pr_interval': measure(content.pr_interval, 'ms'), 'qrs_duration': measure(content.qrs_duration, 'ms'),
            'qt_corrected': measure(content.qt_qtc, 'ms', qtc=True)}}


class Server(HTTPServer):
    def handle_error(self, request, client_address):
        pass  # Nunca traceback con datos externos.


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def respond(self, status, body):
        raw = json.dumps(body, allow_nan=False, separators=(',', ':')).encode('utf-8')
        if len(raw) > MAX_RESPONSE:
            raise ValueError('bounded_response')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == '/ping':
            self.respond(200, {'status': 'ready', 'contract': CONTRACT, 'sourceReference': SOURCE})
        else:
            self.respond(404, {'error': 'not_found'})

    def do_POST(self):
        self.connection.settimeout(10)
        if self.path != '/extract':
            self.respond(404, {'error': 'not_found'})
            return
        length = self.headers.get('Content-Length', '')
        if len(self.headers.get_all('Content-Length', [])) != 1 or self.headers.get('Transfer-Encoding') or self.headers.get('Content-Encoding') or not re.fullmatch(r'[0-9]{1,8}', length) or not 0 < int(length) <= MAX_REQUEST:
            self.respond(413, {'error': 'invalid_body_size'})
            return
        if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/json':
            self.respond(415, {'error': 'json_required'})
            return
        try:
            raw = self.rfile.read(int(length))
            if len(raw) != int(length):
                raise Rejected('PDF_INVALID')
            signal.alarm(15)
            result = extract(decode_request(raw))
            self.respond(200, result)
        except Rejected as error:
            self.respond(422, {'contract': CONTRACT, 'error': {'code': str(error)}})
        except Exception:
            self.respond(503, {'error': 'extractor_unavailable'})
        finally:
            signal.alarm(0)


def deadline(_signum, _frame):
    raise TimeoutError('extractor_deadline')


if __name__ == '__main__':
    signal.signal(signal.SIGALRM, deadline)
    Server(('0.0.0.0', 8081), Handler).serve_forever()
