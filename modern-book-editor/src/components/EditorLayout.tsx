import { useParams } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { BookEditor } from './BookEditor';
import { PreviewPanel } from './PreviewPanel';
import { useBookStore } from '../store/useBookStore';
import { useLocalSync } from '../hooks/useLocalSync';

export const EditorLayout: React.FC = () => {
  const { manuscriptId } = useParams();
  const { focusMode, sidebarOpen, previewMode } = useBookStore();
  
  useLocalSync(manuscriptId);

  const showPreview = previewMode !== 'off';
  const isSplit = previewMode === 'split';

  return (
    <div className="flex h-full w-full">
      {!focusMode && sidebarOpen && <Sidebar manuscriptId={manuscriptId} />}
      
      <div className="flex-1 flex h-full overflow-hidden">
        <div className={`${isSplit && showPreview ? 'w-1/2' : 'w-full'} h-full overflow-hidden transition-all`}>
          <BookEditor manuscriptId={manuscriptId} />
        </div>
        
        {showPreview && (
          <div className={`${isSplit ? 'w-1/2 border-l border-zinc-200 dark:border-zinc-800' : 'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm'} h-full`}>
            {previewMode === 'fullscreen' && (
              <button 
                onClick={() => useBookStore.getState().setPreviewMode('off')}
                className="absolute top-4 right-4 z-50 px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium shadow-lg hover:bg-zinc-800"
              >
                Close Preview
              </button>
            )}
            <div className={`h-full ${previewMode === 'fullscreen' ? 'p-8' : ''}`}>
              <PreviewPanel />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
