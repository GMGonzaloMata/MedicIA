"""Prueba real: primero ECG numérico sintético, luego UN PDF con header y trazos reales del lector."""
import base64
import hashlib
import json
import math
import sys
import urllib.error
import urllib.request
import uuid
from synthetic_pdf import combined_pdf

MAX_RESPONSE = 4 * 1024 * 1024


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def call(url, body):
    raw = json.dumps(body, allow_nan=False, separators=(',', ':')).encode()
    request = urllib.request.Request(url, raw, {'Content-Type': 'application/json', 'Content-Length': str(len(raw))})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        response = opener.open(request, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        payload = response.read(MAX_RESPONSE + 1)
        if len(payload) > MAX_RESPONSE or response.headers.get_content_type() != 'application/json':
            raise RuntimeError('invalid_bounded_response')
        return response.status, json.loads(payload)


def scored(status, result):
    assert status == 200
    assert set(result) == {'status', 'model', 'target', 'score', 'research_only'}
    assert result['status'] == 'scored' and result['model'] == 'e022-combined'
    assert result['target'] == 'lvef_lte_45' and result['research_only'] is True
    assert type(result['score']) in (int, float) and math.isfinite(result['score']) and 0 <= result['score'] <= 1


def main(model, reader):
    wave = [[round(300 * math.sin(i / 37)) for i in range(5000)] for _ in range(12)]
    numeric = {'waveform_uv': wave, 'observed': [[True] * 5000 for _ in range(12)],
        'tabular': {'age_at_ecg': 49, 'sex': 0, 'ventricular_rate': 68, 'pr_interval': 172, 'qrs_duration': 96, 'qt_corrected': 410}}
    status, result = call(model + '/invocations', numeric)
    scored(status, result)
    print(json.dumps({'gate': 'synthetic_numeric_real_e022', 'http': status, 'response': result}), flush=True)
    numeric['observed'] = [[False] * 5000 for _ in range(12)]
    status, rejection = call(model + '/invocations', numeric)
    assert status == 422 and rejection['status'] == 'unscored' and 'score' not in rejection
    print(json.dumps({'gate': 'unobserved_signal_not_negative', 'http': status, 'scorePresent': False}), flush=True)
    pdf = combined_pdf()
    status, extraction = call(reader + '/extract', {'contract': 'mortara-extraction.v1',
        'pdfBase64': base64.b64encode(pdf).decode('ascii'), 'requestId': str(uuid.uuid4())})
    assert status == 200 and extraction['sourceReference'] == 'git:4ff99ce97a42ff32a47268996f3cedcdabe70c1c'
    assert extraction['contract'] == 'mortara-extraction.v1' and extraction['extractorVersion'] == '2'
    measurements = extraction['measurements']
    assert measurements['sex'] == 'female' and measurements['age'] == {'value': 49.0, 'unit': 'years'}
    assert measurements['qt_corrected'] == {'value': 410.0, 'unit': 'ms'}
    leads = {lead['name']: lead for lead in extraction['leads']}
    order = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']
    payload = {'waveform_uv': [leads[name]['samples'] for name in order], 'observed': [leads[name]['observed'] for name in order],
        'tabular': {'age_at_ecg': measurements['age']['value'], 'sex': 0,
            **{field: measurements[field]['value'] for field in ['ventricular_rate', 'pr_interval', 'qrs_duration', 'qt_corrected']}}}
    status, result = call(model + '/invocations', payload)
    scored(status, result)
    # No imprimir PDF, arrays, medidas ni identidad (incluso sintética); conservar solo hashes/evidencia.
    print(json.dumps({'gate': 'combined_synthetic_pdf_real_reader_real_e022', 'http': status,
        'syntheticPdfSha256': hashlib.sha256(pdf).hexdigest(), 'sourceReference': extraction['sourceReference'],
        'observedSamples': sum(sum(lead['observed']) for lead in leads.values()), 'response': result}), flush=True)


if __name__ == '__main__':
    try:
        main(sys.argv[1], sys.argv[2])
    except Exception:
        print('Synthetic runtime smoke failed; preserve container exit/logs. No clinical payload logged.', file=sys.stderr)
        raise SystemExit(1) from None
