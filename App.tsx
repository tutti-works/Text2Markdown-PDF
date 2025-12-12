import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';

// Icons
const SparklesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.625 21.75l-.269-1.183a1.5 1.5 0 0 0-1.094-1.093l-1.183-.269 1.183-.269a1.5 1.5 0 0 0 1.094 1.093l.269-1.183.269 1.183a1.5 1.5 0 0 0-1.094 1.093l1.183.269-1.183.269a1.5 1.5 0 0 0-1.094 1.093Z" />
  </svg>
);

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
  </svg>
);

const DocumentIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
  </svg>
);

// Helper function for exponential backoff
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 2000,
  factor = 2
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isOverloaded = 
      error?.status === 503 || 
      error?.code === 503 || 
      (error?.message && (error.message.includes('503') || error.message.includes('overloaded') || error.message.includes('UNAVAILABLE')));
      
    if (retries > 0 && isOverloaded) {
      console.warn(`Model overloaded. Retrying in ${delay}ms... (${retries} attempts left)`);
      await wait(delay);
      return retryWithBackoff(fn, retries - 1, delay * factor, factor);
    }
    throw error;
  }
}

export default function App() {
  const [inputText, setInputText] = useState('');
  const [markdownText, setMarkdownText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  // Check for persisted session on load (optional but good for UX)
  useEffect(() => {
    // Simple session persistence could be added here if needed
  }, []);

  const handleLoginSuccess = (credentialResponse: any) => {
    try {
      if (!credentialResponse.credential) {
        setLoginError("ログイン情報が取得できませんでした。");
        return;
      }
      
      const decoded: any = jwtDecode(credentialResponse.credential);
      const email = decoded.email;
      
      const allowedEmailsEnv = process.env.ALLOWED_EMAILS || '';
      // Split by comma and trim whitespace
      const allowedList = allowedEmailsEnv.split(',').map(e => e.trim()).filter(e => e);
      
      // Check if list is defined. If empty, maybe allow all? Or block all? 
      // Safe default: Block all if list is empty to prevent accidents.
      if (allowedList.length === 0) {
        setLoginError("管理者設定エラー: 許可リストが設定されていません。");
        return;
      }

      if (allowedList.includes(email)) {
        setIsAuthenticated(true);
        setCurrentUser(email);
        setLoginError('');
      } else {
        setLoginError("このアカウントにはアクセス権限がありません。");
      }
    } catch (e) {
      console.error("Login processing error", e);
      setLoginError("ログイン処理中にエラーが発生しました。");
    }
  };

  const handleGenerate = async () => {
    if (!inputText.trim()) return;

    setIsGenerating(true);
    setMarkdownText(''); // Clear previous output
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const model = 'gemini-2.5-flash';
      
      const prompt = `
        あなたは優秀なドキュメント作成アシスタントです。
        以下のテキストを、読みやすく構造化された美しいMarkdown形式に整理してください。
        
        【要件】
        - 適切な見出し（# H1, ## H2など）を使って階層構造を作る
        - 箇条書きや番号付きリストを効果的に使う
        - 表形式（Table）が適切なデータがあれば、積極的にMarkdownの表組みを使うこと
        - 重要な部分は太字にする
        - 内容の要約ではなく、元のテキストの情報を整理・整形すること
        - 冒頭や末尾の挨拶、「はい、わかりました」などの返答は一切不要。Markdownの内容のみを出力すること。

        【入力テキスト】
        ${inputText}
      `;

      const response = await retryWithBackoff(async () => {
        return await ai.models.generateContent({
          model,
          contents: prompt,
        });
      });

      const text = response.text;
      if (text) {
        setMarkdownText(text);
      }
    } catch (error: any) {
      console.error('Error generating markdown:', error);
      let errorMessage = 'エラーが発生しました。';
      const errorStr = error?.message || String(error);
      
      if (errorStr.includes('503') || errorStr.includes('overloaded')) {
        errorMessage = '現在アクセスが集中しており、AIモデルが応答できませんでした。しばらく時間をおいてから再度お試しください。';
      } else {
        errorMessage += '\n' + errorStr;
      }
      setMarkdownText(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const executePrint = () => {
    try {
      window.print();
    } catch (e) {
      console.error("Print failed", e);
      alert("印刷ウィンドウを開けませんでした。"); 
    }
  };

  // Convert Markdown to HTML
  const getRenderedHtml = () => {
    if (!markdownText) return '';
    return window.marked ? window.marked.parse(markdownText) : markdownText;
  };

  // --- Login Screen ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full text-center border border-slate-200">
          <div className="bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 text-primary">
            <DocumentIcon />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Text2Markdown PDF</h1>
          <p className="text-slate-500 mb-8">
            アクセスするには、許可されたGoogleアカウントでログインしてください。
          </p>
          
          <div className="flex justify-center mb-4">
            <GoogleLogin
              onSuccess={handleLoginSuccess}
              onError={() => {
                setLoginError('ログインに失敗しました。');
              }}
            />
          </div>
          
          {loginError && (
            <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
              {loginError}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Main App Screen ---
  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-800 bg-slate-50">
      {/* Header - Hidden when printing */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-2 rounded-lg text-primary">
              <DocumentIcon />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600">
              Text2Markdown PDF
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-slate-500 hidden sm:block">
              {currentUser} としてログイン中
            </div>
            <button 
              onClick={() => setIsAuthenticated(false)}
              className="text-slate-500 hover:text-slate-800 underline"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row gap-6 print:block print:p-0 print:m-0">
        
        {/* Left Column: Input - Hidden when printing */}
        <div className="flex-1 flex flex-col gap-4 min-w-0 print:hidden">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <label htmlFor="input-text" className="font-semibold text-slate-700 flex items-center gap-2">
                <span className="w-2 h-6 bg-primary rounded-full"></span>
                元のテキスト
              </label>
              <span className="text-xs text-slate-400">Ctrl + V で貼り付け</span>
            </div>
            
            <textarea
              id="input-text"
              className="flex-1 w-full p-4 rounded-lg bg-slate-50 border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none outline-none text-sm leading-relaxed"
              placeholder="ここに議事録、メモ、下書きなどのテキストを貼り付けてください..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleGenerate}
                disabled={!inputText.trim() || isGenerating}
                className={`
                  flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-white transition-all
                  ${!inputText.trim() || isGenerating 
                    ? 'bg-slate-300 cursor-not-allowed' 
                    : 'bg-primary hover:bg-blue-600 shadow-md hover:shadow-lg active:scale-95'}
                `}
              >
                {isGenerating ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    整形中...
                  </>
                ) : (
                  <>
                    <SparklesIcon />
                    AIで整形する
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Preview */}
        <div className="flex-1 flex flex-col gap-4 min-w-0 print:w-full print:block">
          {/* Preview Header - Hidden when printing */}
          <div className="flex items-center justify-between h-10 print:hidden">
            <h2 className="font-semibold text-slate-700 flex items-center gap-2">
              <span className="w-2 h-6 bg-emerald-500 rounded-full"></span>
              プレビュー
            </h2>
            {markdownText && (
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={executePrint}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-primary transition-colors"
                  title="PDFとして保存 / 印刷"
                >
                  <DownloadIcon />
                  PDFとして保存 / 印刷
                </button>
              </div>
            )}
          </div>

          {/* Preview Content Container */}
          <div className={`
            flex-1 bg-slate-200/50 rounded-xl border border-slate-200 p-4 lg:p-6 overflow-y-auto max-h-[calc(100vh-12rem)] shadow-inner
            print:bg-white print:border-none print:shadow-none print:p-0 print:overflow-visible print:max-h-none print:w-full
          `}>
            {markdownText ? (
              <div className="flex justify-center print:block print:w-full">
                {/* A4 Paper Simulation Area */}
                <div 
                  ref={previewRef}
                  className="a4-page markdown-body print:w-full print:p-0 print:m-0 print:shadow-none"
                  dangerouslySetInnerHTML={{ __html: getRenderedHtml() }}
                />
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 min-h-[400px] print:hidden">
                <DocumentIcon />
                <p>左側のフォームに入力して「AIで整形する」を押してください</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}