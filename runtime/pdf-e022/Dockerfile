# Imagen recibida y verificada; NO recompila ni copia entrenamiento/modelos al repositorio.
# Sin default mutable: el build DEBE aportar e022base desde el layout OCI verificado por digest.
FROM e022base
USER 0
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/reader/src
WORKDIR /app
COPY requirements.txt /app/requirements-reader.txt
RUN python -m pip install --no-cache-dir -r /app/requirements-reader.txt \
 && mkdir /model && chown 65534:65534 /model
COPY reader /app/reader
COPY synthetic_waveform.py extractor.py synthetic_pdf.py smoke.py verify_model.py /app/
COPY tests /app/tests
USER 65534:65534
EXPOSE 8081
ENTRYPOINT ["python", "-B", "/app/extractor.py"]
