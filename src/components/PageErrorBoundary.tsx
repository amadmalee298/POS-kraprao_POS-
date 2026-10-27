import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * One page that fails shows a message in its place; the menu and the other pages keep working
 * (a failure anywhere used to replace the whole app with the error screen).
 */
export class PageErrorBoundary extends React.Component<{ children?: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-4 sm:p-8 flex justify-center">
        <div className="max-w-md w-full rounded-2xl border border-rose-800/60 bg-rose-950/30 p-5 text-center space-y-3 text-sm text-slate-200">
          <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
          <div className="font-bold">หน้านี้แสดงผลไม่ได้</div>
          <div className="text-xs text-slate-400 break-words">{this.state.error.message}</div>
          <div className="text-xs text-slate-400">ข้อมูลไม่หาย เลือกหน้าอื่นจากเมนูได้ตามปกติ</div>
          <button type="button" onClick={() => this.setState({ error: null })} className="h-10 px-4 rounded-xl bg-slate-800 border border-slate-700 font-bold inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> ลองอีกครั้ง
          </button>
        </div>
      </div>
    );
  }
}
