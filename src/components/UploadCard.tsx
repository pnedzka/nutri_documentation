import { useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUp, Upload } from 'lucide-react';
import { MAX_UPLOAD_BYTES } from '../../shared/schema.ts';
import { Button } from './Button';
import { Card, CardBody, CardHeader } from './Card';
import { Input } from './Input';
import { uploadDocument, validateFile } from '../lib/upload';
import { useToast } from '../lib/toast';

export function UploadCard() {
  const navigate = useNavigate();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [npProductName, setName] = useState('');
  const [npProductCode, setCode] = useState('');
  const [step, setStep] = useState<string | null>(null);

  const pick = (f: File | undefined) => {
    if (!f) return;
    const problem = validateFile(f);
    if (problem) return toast.error(problem);
    setFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  };

  const submit = async () => {
    if (!file) return;
    try {
      const doc = await uploadDocument(file, { npProductName, npProductCode }, setStep);
      toast.success('Document received', 'Reading and verification in progress – this may take a few minutes.');
      navigate(`/dokumenty/${doc.id}`);
    } catch (e) {
      toast.error('Could not upload the document', (e as Error).message);
      setStep(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <FileUp size={16} className="text-[#CC1F1F]" />
        <h2 className="text-sm font-semibold text-gray-900">New document</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
            dragging ? 'border-[#CC1F1F] bg-red-50/50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <Upload size={22} className="text-gray-400" />
          {file ? (
            <p className="text-sm font-medium text-gray-900 break-words">{file.name}</p>
          ) : (
            <p className="text-sm text-gray-600">
              Drop a supplier file here or <span className="text-[#CC1F1F] font-medium">browse</span>
            </p>
          )}
          <p className="text-xs text-gray-400">PDF, DOCX, JPG or PNG · up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB</p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="NP product name" placeholder="optional" value={npProductName} onChange={(e) => setName(e.target.value)} />
          <Input label="NP product code" placeholder="optional" value={npProductCode} onChange={(e) => setCode(e.target.value)} />
        </div>
        <p className="text-xs text-gray-500 -mt-1">
          These replace the supplier's trade name and product code. If left empty, those fragments are simply removed.
        </p>
        <div className="flex items-center gap-3">
          <Button onClick={() => void submit()} disabled={!file} isLoading={!!step}>
            Neutralize document
          </Button>
          {step && <span className="text-sm text-gray-500">{step}</span>}
        </div>
      </CardBody>
    </Card>
  );
}
