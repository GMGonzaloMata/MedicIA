"""Une header inventado del test público y trazado vectorial del fixture fijado."""
from pathlib import Path
from tempfile import TemporaryDirectory
import pymupdf
from synthetic_waveform import crear_pdf_ecg_con_trazos_sinteticos

HEADER = (
    'MORTARA ELI 380\n'
    'Prueba Sintetica~,                    ID:900321                  '
    '05-JUN-2025  10:22:31        HOSPITAL FICTICIO   ROUTINE RECORD\n'
    '12-DEC-1975 (49 yr)      Female      Unknown\nRoom:\nLoc:3\n'
    'Vent. rate            68    BPM\nPR interval          172    ms\n'
    'QRS duration           96    ms\nQT/QTc            390/410    ms\n'
    'P-R-T axes         55  40    30\nTechnician:\nTest ind:\nMed:\n'
    'Ordered by:  - Dr Ficticio Derivante                          Unconfirmed\n'
)


def combined_pdf(*, with_signal=True):
    # Scratch del test, fuera del árbol de código; teardown de TemporaryDirectory.
    with TemporaryDirectory(prefix='medicia-synthetic-pdf-') as temporary:
        path = Path(temporary) / 'synthetic.pdf'
        if with_signal:
            crear_pdf_ecg_con_trazos_sinteticos(path, semilla=1)
            doc = pymupdf.open(path)
        else:
            doc = pymupdf.open()
            doc.new_page(width=612, height=792).set_rotation(90)
        try:
            doc[0].insert_text((12, 16), HEADER, fontsize=7)
            return doc.tobytes()
        finally:
            doc.close()


if __name__ == '__main__':
    import base64
    print(base64.b64encode(combined_pdf()).decode('ascii'))
