// Guest Import Modal - CSV/Excel file upload
import { useState, useRef } from 'react';
import { API_URL } from '../../constants';

interface ImportResult {
  success: boolean;
  uploadId?: number;
  summary?: {
    totalRecords: number;
    successCount: number;
    failedCount: number;
    eventId: number | null;
  };
  errors?: Array<{ row: number; error: string }>;
  addedGuests?: Array<{ id: number; name: string; email: string }>;
}

interface GuestImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
  eventId?: string | null;
}

export const GuestImportModal = ({ onClose, onSuccess, eventId }: GuestImportModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [defaultCategory, setDefaultCategory] = useState('pending');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validExtensions = ['.csv', '.xlsx', '.xls'];
      const isValid = validExtensions.some(ext =>
        selectedFile.name.toLowerCase().endsWith(ext)
      );

      if (!isValid) {
        setError('Please select a CSV or Excel file (.csv, .xlsx, .xls)');
        setFile(null);
        return;
      }

      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', defaultCategory);
    if (eventId) {
      formData.append('eventId', eventId);
    }

    try {
      const response = await fetch(`${API_URL}/uploads/contacts`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setResult(data);

      if (data.success && data.summary?.successCount > 0) {
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const validExtensions = ['.csv', '.xlsx', '.xls'];
      const isValid = validExtensions.some(ext =>
        droppedFile.name.toLowerCase().endsWith(ext)
      );

      if (!isValid) {
        setError('Please select a CSV or Excel file (.csv, .xlsx, .xls)');
        return;
      }

      setFile(droppedFile);
      setError(null);
      setResult(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0a0a0a',
          border: '1px solid #222',
          borderRadius: 16,
          width: '100%',
          maxWidth: 500,
          maxHeight: '90vh',
          overflow: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Import Guests</h2>
            <p style={{ fontSize: 13, color: '#666', margin: '4px 0 0' }}>Upload CSV or Excel file</p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#666',
              fontSize: 24,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 24 }}>
          {/* Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed #333',
              borderRadius: 12,
              padding: 32,
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: file ? '#111' : 'transparent',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            {file ? (
              <>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>{file.name}</div>
                <div style={{ fontSize: 13, color: '#666' }}>
                  {(file.size / 1024).toFixed(1)} KB
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setResult(null);
                  }}
                  style={{
                    marginTop: 12,
                    background: '#1a1a1a',
                    border: 'none',
                    color: '#888',
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📥</div>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Drop file here or click to browse</div>
                <div style={{ fontSize: 13, color: '#666' }}>
                  Supports CSV, XLSX, XLS (max 10MB)
                </div>
              </>
            )}
          </div>

          {/* Category Selector */}
          <div style={{ marginTop: 20 }}>
            <label style={{ fontSize: 14, color: '#888', display: 'block', marginBottom: 8 }}>
              Default Category
            </label>
            <select
              value={defaultCategory}
              onChange={e => setDefaultCategory(e.target.value)}
              style={{
                width: '100%',
                background: '#111',
                border: '1px solid #222',
                borderRadius: 8,
                padding: '10px 12px',
                color: '#fff',
                fontSize: 14,
              }}
            >
              <option value="pending">Pending</option>
              <option value="A">VIP</option>
              <option value="B">Priority</option>
              <option value="C">Standard</option>
            </select>
          </div>

          {/* Expected Columns Info */}
          <div style={{
            marginTop: 20,
            padding: 16,
            background: '#111',
            borderRadius: 8,
            fontSize: 13,
          }}>
            <div style={{ fontWeight: 500, marginBottom: 8, color: '#888' }}>Expected Columns:</div>
            <div style={{ color: '#666', lineHeight: 1.6 }}>
              <strong style={{ color: '#888' }}>Required:</strong> name, email<br />
              <strong style={{ color: '#888' }}>Optional:</strong> phone, instagram, category, notes
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              marginTop: 16,
              padding: 12,
              background: '#ef444420',
              border: '1px solid #ef4444',
              borderRadius: 8,
              color: '#ef4444',
              fontSize: 14,
            }}>
              {error}
            </div>
          )}

          {/* Success Result */}
          {result?.success && (
            <div style={{
              marginTop: 16,
              padding: 16,
              background: '#22c55e15',
              border: '1px solid #22c55e40',
              borderRadius: 8,
            }}>
              <div style={{ fontWeight: 500, color: '#22c55e', marginBottom: 8 }}>
                Import Complete
              </div>
              <div style={{ fontSize: 14, color: '#888' }}>
                <div>Total records: {result.summary?.totalRecords}</div>
                <div style={{ color: '#22c55e' }}>Imported: {result.summary?.successCount}</div>
                {(result.summary?.failedCount || 0) > 0 && (
                  <div style={{ color: '#f59e0b' }}>Skipped: {result.summary?.failedCount}</div>
                )}
              </div>

              {result.errors && result.errors.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, color: '#666' }}>
                    View errors ({result.errors.length})
                  </summary>
                  <div style={{ marginTop: 8, maxHeight: 150, overflow: 'auto', fontSize: 12 }}>
                    {result.errors.slice(0, 10).map((err, i) => (
                      <div key={i} style={{ color: '#f59e0b', padding: '4px 0' }}>
                        Row {err.row}: {err.error}
                      </div>
                    ))}
                    {result.errors.length > 10 && (
                      <div style={{ color: '#666' }}>...and {result.errors.length - 10} more</div>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #1a1a1a',
          display: 'flex',
          gap: 12,
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              background: '#1a1a1a',
              border: 'none',
              color: '#888',
              padding: '10px 20px',
              borderRadius: 8,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {result?.success ? 'Close' : 'Cancel'}
          </button>

          {!result?.success && (
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              style={{
                background: file && !uploading ? '#d4af37' : '#333',
                border: 'none',
                color: file && !uploading ? '#000' : '#666',
                padding: '10px 24px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: file && !uploading ? 'pointer' : 'not-allowed',
              }}
            >
              {uploading ? 'Uploading...' : 'Import Guests'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
