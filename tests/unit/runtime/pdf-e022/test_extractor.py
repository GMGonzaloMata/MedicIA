"""Pruebas sintéticas del wrapper; ejecutar solo en el contenedor preparado."""
import base64
import json
import unittest
from unittest.mock import patch
import numpy as np
from extractor import extract, decode_request, Rejected, CONTRACT, SOURCE
from synthetic_pdf import combined_pdf


class ExtractorTests(unittest.TestCase):
    def test_real_combined_pdf_has_text_and_vector_signal_without_identity(self):
        data = combined_pdf()
        result = extract(data)
        self.assertEqual(set(result), {'contract', 'extractorVersion', 'sourceReference', 'samplingHz', 'unit', 'leads', 'measurements'})
        self.assertEqual((result['contract'], result['extractorVersion'], result['sourceReference']), (CONTRACT, '2', SOURCE))
        self.assertEqual((result['samplingHz'], result['unit']), (500, 'uV'))
        self.assertEqual([lead['name'] for lead in result['leads']], ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'])
        for lead in result['leads']:
            self.assertEqual(len(lead['samples']), 5000)
            self.assertEqual(len(lead['observed']), 5000)
            self.assertTrue(any(lead['observed']))
            self.assertTrue(all(type(v) is bool for v in lead['observed']))
            self.assertTrue(all(v == 0 for v, seen in zip(lead['samples'], lead['observed']) if not seen))
        self.assertEqual(result['measurements'], {'sex': 'female', 'age': {'value': 49.0, 'unit': 'years'},
            'ventricular_rate': {'value': 68.0, 'unit': 'bpm'}, 'atrial_rate': {'value': None, 'unit': 'bpm'},
            'pr_interval': {'value': 172.0, 'unit': 'ms'}, 'qrs_duration': {'value': 96.0, 'unit': 'ms'},
            'qt_corrected': {'value': 410.0, 'unit': 'ms'}})
        wire = json.dumps(result, allow_nan=False)
        for private in ['Prueba', 'Sintetica', '900321', '1975', 'HOSPITAL', 'identidad', 'adicionales']:
            self.assertNotIn(private, wire)

    def test_structurally_compatible_pdf_does_not_require_literal_brand_header(self):
        from synthetic_pdf import HEADER
        expected = extract(combined_pdf())
        with patch('synthetic_pdf.HEADER', HEADER.replace('MORTARA ELI 380\n', '')):
            data = combined_pdf()
        self.assertEqual(extract(data), expected)

    def test_headerless_metadata_without_signal_remains_unsupported(self):
        from synthetic_pdf import HEADER
        with patch('synthetic_pdf.HEADER', HEADER.replace('MORTARA ELI 380\n', '')):
            data = combined_pdf(with_signal=False)
        with self.assertRaises(Rejected) as info:
            extract(data)
        self.assertEqual(str(info.exception), 'PDF_UNSUPPORTED')

    def test_headerless_pdf_preserves_preflight_guards(self):
        import hashlib
        import pymupdf
        from extractor import MAX_PDF
        from synthetic_pdf import HEADER

        with patch('synthetic_pdf.HEADER', HEADER.replace('MORTARA ELI 380\n', '')):
            data = combined_pdf()
        with pymupdf.open(stream=data, filetype='pdf') as doc:
            protected = doc.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256,
                owner_pw='synthetic', user_pw='synthetic')
            doc.new_page()
            multipage = doc.tobytes()
        oversized = data + b' ' * (MAX_PDF + 1 - len(data))
        for candidate, expected in [(protected, 'PDF_PROTECTED'),
                (multipage, 'PDF_UNSUPPORTED'), (oversized, 'PDF_INVALID')]:
            with self.subTest(code=expected):
                before = hashlib.sha256(candidate).digest()
                with self.assertRaises(Rejected) as error:
                    extract(candidate)
                self.assertEqual(str(error.exception), expected)
                self.assertEqual(hashlib.sha256(candidate).digest(), before)

    def test_parseador_called_once(self):
        from anonimizacion.parseo.ecg_mortara import ParseadorEcgMortara
        original = ParseadorEcgMortara.parsear
        calls = []
        def once(self, text):
            calls.append(1)
            return original(self, text)
        with patch.object(ParseadorEcgMortara, 'parsear', once):
            extract(combined_pdf())
        self.assertEqual(calls, [1])

    def test_strict_request_only_bytes_no_path_identity_or_extra_keys(self):
        request = {'contract': CONTRACT, 'requestId': '6db7e443-3a8f-43b2-a3aa-ab39583d5180',
                   'pdfBase64': base64.b64encode(b'%PDF-invalid').decode()}
        self.assertEqual(decode_request(json.dumps(request).encode()), b'%PDF-invalid')
        for change in [dict(request, path='/private.pdf'), dict(request, requestId='patient-name'),
                       dict(request, pdfBase64='not canonical'), dict(request, contract='other')]:
            with self.assertRaises(Rejected):
                decode_request(json.dumps(change).encode())
        with self.assertRaises(Rejected):
            decode_request(b'{"contract":"mortara-extraction.v1","contract":"mortara-extraction.v1"}')

    def test_invalid_protected_unsupported_and_incomplete_are_sanitized(self):
        import pymupdf
        for data, code in [(b'not a PDF', 'PDF_INVALID'), (b'%PDF-broken', 'PDF_INVALID'), (b'', 'PDF_INVALID')]:
            with self.assertRaises(Rejected) as info:
                extract(data)
            self.assertEqual(str(info.exception), code)
        doc = pymupdf.open()
        doc.new_page().insert_text((20, 20), 'Not a Mortara ECG')
        with self.assertRaises(Rejected) as info:
            extract(doc.tobytes())
        self.assertEqual(str(info.exception), 'PDF_UNSUPPORTED')
        with self.assertRaises(Rejected) as info:
            extract(doc.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw='synthetic', user_pw='synthetic'))
        self.assertEqual(str(info.exception), 'PDF_PROTECTED')
        doc.close()
        with self.assertRaises(Rejected) as info:
            extract(combined_pdf(with_signal=False))
        self.assertEqual(str(info.exception), 'PDF_INCOMPLETE')

    def test_float_output_is_never_fabricated_for_missing_signal(self):
        # El caso anterior prueba el parser real; esta aserción fija el dtype del productor.
        result = extract(combined_pdf())
        self.assertTrue(np.isfinite(np.asarray([lead['samples'] for lead in result['leads']])).all())


if __name__ == '__main__':
    unittest.main()
