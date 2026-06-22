FROM python:3.11-slim

# Tesseract OCR is required by the pytesseract Python wrapper (used by /api/documents/extract-text).
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway injects $PORT at runtime. Default to 8000 so `docker run` works locally without -e PORT.
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
