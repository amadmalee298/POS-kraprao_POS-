import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React Error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearCacheAndReload = () => {
    if (window.confirm('คุณต้องการรีเซ็ตแคชข้อมูล LocalStorage หรือไม่? (ข้อมูลการตั้งค่าจะกลับเป็นค่าเริ่มต้น)')) {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        console.error('Failed to clear storage:', e);
      }
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070b14] text-slate-100 flex items-center justify-center p-4 font-sans antialiased">
          <div className="max-w-lg w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 bg-rose-500/20 border border-rose-500/40 rounded-full flex items-center justify-center mx-auto text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-extrabold text-white">เกิดข้อผิดพลาดในการแสดงผล</h1>
              <p className="text-slate-400 text-sm">
                ระบบพบปัญหาการประมวลผล ไม่ต้องกังวล! ข้อมูลขายของคุณถูกบันทึกอย่างปลอดภัยแล้ว
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 text-left overflow-auto max-h-36">
                <p className="text-xs font-mono text-rose-400 font-semibold mb-1">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-[10px] font-mono text-slate-500 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold rounded-xl text-sm transition flex items-center justify-center space-x-2 shadow-lg active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>รีโหลดหน้าระบบใหม่</span>
              </button>

              <button
                onClick={this.handleClearCacheAndReload}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm transition flex items-center justify-center space-x-2 active:scale-95"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>ล้างแคชข้อมูล</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500">
              ครัวกะเพรา POS Enterprise System • สถาปัตยกรรมกันหน้าขาวอัตโนมัติ
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
