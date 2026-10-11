export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Keep the object URL alive long enough for the browser to begin the download.
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

export function rowsToCsv(rows: Record<string, string | number | null | undefined>[]) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const encode = (value: string | number | null | undefined) => {
    const text = String(value ?? '');
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [headers.map(encode).join(','), ...rows.map((row) => headers.map((header) => encode(row[header])).join(','))].join('\r\n');
}
