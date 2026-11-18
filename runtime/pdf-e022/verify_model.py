"""Importador por stdin binario: TAR cerrado, hashes de archivo y miembros antes de cargar código."""
import hashlib
import json
from pathlib import Path
import sys
import tarfile

ARCHIVE_SHA = 'a453f8cbcb580f8ff0e591ba90e872931a658d60e0fedb6184d4a619e9583f96'
ARCHIVE_SIZE = 344096102
PINS = {
    'net1d.py': ('832bf90e05e20e62db6f9c7007acf7f0b1f739938ab80fa9b2c1ad438e8da7f7', 13449),
    '12_lead_ECGFounder.pth': ('ee199f3781f4ae1f732973267f003da0a759ea12bddb0dd28a77faa60aca7997', 369942585),
    'e022_model.npz': ('70a9d080cd64e8d5a8cb943e37a0fb1f0eccfe74d488239d7080de3430bceabf', 25115),
    'LICENSE-ECGFounder.txt': ('b872b97f0675d67a350880e22e21ffd9fb76dfcb8989f89d950bd3f49eca959e', 1073),
}


class HashingReader:
    def __init__(self, stream):
        self.stream = stream
        self.digest = hashlib.sha256()
        self.size = 0

    def read(self, size=-1):
        # tarfile pide bloques; no permitir una lectura de archivo completa accidental.
        if size < 0:
            size = 1024 * 1024
        data = self.stream.read(size)
        self.size += len(data)
        if self.size > ARCHIVE_SIZE:
            raise ValueError('archive_size_mismatch')
        self.digest.update(data)
        return data


def verify(stream, destination):
    root = Path(destination)
    if not root.is_dir() or any(root.iterdir()):
        raise ValueError('model_destination_must_be_empty')
    hashed = HashingReader(stream)
    found = set()
    with tarfile.open(fileobj=hashed, mode='r|gz') as archive:
        for member in archive:
            # tarfile resuelve PAX estándar ANTES de entregar el nombre efectivo.
            if not member.isreg() or member.name not in PINS or member.name in found or member.linkname:
                raise ValueError('unsafe_or_unknown_tar_member')
            expected, expected_size = PINS[member.name]
            if member.size != expected_size:
                raise ValueError('member_size_mismatch')
            digest = hashlib.sha256()
            source = archive.extractfile(member)
            if source is None:
                raise ValueError('missing_regular_member')
            with source, (root / member.name).open('xb') as output:
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
                    output.write(chunk)
            if digest.hexdigest() != expected:
                raise ValueError('member_hash_mismatch')
            found.add(member.name)
    # El TAR puede terminar antes del gzip: cubrir todos los bytes comprimidos, incluido su trailer.
    while hashed.read(1024 * 1024):
        pass
    if found != set(PINS) or hashed.size != ARCHIVE_SIZE or hashed.digest.hexdigest() != ARCHIVE_SHA:
        raise ValueError('archive_provenance_mismatch')
    result = {'archiveSha256': ARCHIVE_SHA, 'archiveBytes': hashed.size, 'members': {name: sha for name, (sha, _) in PINS.items()}}
    # Marcador solo DESPUÉS de todas las comprobaciones. No carga net1d ni pesos.
    (root / 'medicia-verified.json').write_text(json.dumps(result, sort_keys=True), encoding='utf-8')
    return result


def check_installed(destination):
    root = Path(destination)
    marker = json.loads((root / 'medicia-verified.json').read_text(encoding='utf-8'))
    if marker.get('archiveSha256') != ARCHIVE_SHA:
        raise ValueError('missing_provenance')
    for name, (expected, size) in PINS.items():
        path = root / name
        if path.is_symlink() or not path.is_file() or path.stat().st_size != size:
            raise ValueError('installed_member_mismatch')
        with path.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != expected:
                raise ValueError('installed_member_hash_mismatch')
    return {'installedMemberHashesVerified': True, 'archiveSha256': ARCHIVE_SHA}


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--check']:
            result = check_installed('/opt/ml/model')
        elif not sys.argv[1:]:
            result = verify(sys.stdin.buffer, '/model')
        else:
            raise ValueError('unknown_arguments')
        print(json.dumps(result, sort_keys=True))
    except Exception:
        print('Model archive verification failed; preserve the exclusive volume and logs.', file=sys.stderr)
        raise SystemExit(1) from None
