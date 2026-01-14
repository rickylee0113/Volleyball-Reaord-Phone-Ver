import React, { useState } from 'react';
import { loginWithGoogle } from '../services/firebaseService';

export const LoginView: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
      // Auth state change will be picked up by App.tsx
    } catch (err) {
      setError('登入失敗，請檢查網路或稍後再試');
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full bg-neutral-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-accent/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-court/20 rounded-full blur-3xl pointer-events-none"></div>

      <div className="z-10 flex flex-col items-center max-w-sm w-full space-y-8 animate-fade-in">
        
        {/* Logo / Icon */}
        <div className="w-24 h-24 bg-gradient-to-tr from-accent to-blue-400 rounded-3xl shadow-2xl flex items-center justify-center rotate-12 mb-4">
            <span className="text-5xl">🏐</span>
        </div>

        <div className="text-center space-y-2">
            <h1 className="text-4xl font-black text-white tracking-tight">
              VolleyScout<span className="text-accent">Pro</span>
            </h1>
            <p className="text-gray-400 font-medium">專業排球數據紀錄與分析</p>
        </div>

        {/* Feature List */}
        <div className="w-full bg-neutral-800/50 backdrop-blur border border-neutral-700 rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-3 text-gray-300">
                <span className="text-green-400">✓</span> 雲端儲存比賽數據
            </div>
            <div className="flex items-center gap-3 text-gray-300">
                <span className="text-green-400">✓</span> 即時落點分析圖表
            </div>
            <div className="flex items-center gap-3 text-gray-300">
                <span className="text-green-400">✓</span> 跨裝置同步紀錄
            </div>
        </div>

        {/* Action */}
        <div className="w-full space-y-4">
            {error && (
                <div className="bg-red-500/10 border border-red-500 text-red-200 text-sm p-3 rounded-lg text-center">
                    {error}
                </div>
            )}
            
            <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full bg-white hover:bg-gray-100 text-black font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-white/10"
            >
                {loading ? (
                    <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                )}
                使用 Google 登入
            </button>
            
            <p className="text-xs text-center text-gray-600">
                登入即代表您同意 VolleyScout 使用 cookies 以維持服務運作。
            </p>
        </div>
      </div>
    </div>
  );
};
