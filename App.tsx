import React, { useState, useEffect } from 'react';
import { SetupView } from './components/SetupView';
import { GameView } from './components/GameView';
import { Lineup, TeamConfig, LogEntry, TeamSide, GameState } from './types';
import { auth } from './firebaseConfig';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<'setup' | 'game'>('setup');
  
  // Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false); // Toggle between Login and Register
  const [authError, setAuthError] = useState<string | null>(null);

  // Team Configuration
  const [teamConfig, setTeamConfig] = useState<TeamConfig>({
    matchName: '',
    myName: '',
    opName: ''
  });

  // Current Game State
  const [currentSet, setCurrentSet] = useState(1);
  const [mySetWins, setMySetWins] = useState(0);
  const [opSetWins, setOpSetWins] = useState(0);
  
  const [myLineup, setMyLineup] = useState<Lineup>(({ 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' }));
  const [opLineup, setOpLineup] = useState<Lineup>(({ 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' }));
  const [myScore, setMyScore] = useState(0);
  const [opScore, setOpScore] = useState(0);
  const [servingTeam, setServingTeam] = useState<TeamSide>('me');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // History Stacks
  const [history, setHistory] = useState<GameState[]>([]);
  const [future, setFuture] = useState<GameState[]>([]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Prevent accidental close/refresh
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (view === 'game' && logs.length > 0) {
        e.preventDefault();
        e.returnValue = ''; 
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [view, logs]);

  // Auth Functions
  const handleGoogleLogin = async () => {
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed", error);
      setAuthError("Google 登入失敗: " + error.message);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!email || !password) {
        setAuthError("請輸入 Email 和密碼");
        return;
    }

    try {
        if (isSignUp) {
            await createUserWithEmailAndPassword(auth, email, password);
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
    } catch (error: any) {
        console.error("Auth failed", error);
        let msg = "認證失敗";
        if (error.code === 'auth/invalid-email') msg = "Email 格式錯誤";
        else if (error.code === 'auth/user-not-found') msg = "找不到此使用者";
        else if (error.code === 'auth/wrong-password') msg = "密碼錯誤";
        else if (error.code === 'auth/email-already-in-use') msg = "此 Email 已被註冊";
        else if (error.code === 'auth/weak-password') msg = "密碼強度不足 (至少6位)";
        setAuthError(msg);
    }
  };

  const handleLogout = async () => {
    if (view === 'game' && logs.length > 0) {
      const confirm = window.confirm("正在比賽中，登出將遺失未儲存的紀錄。確定要登出嗎？");
      if (!confirm) return;
    }
    await signOut(auth);
    handleNewMatch(); // Reset state on logout
  };

  // Helper to capture current state
  const getCurrentState = (): GameState => ({
    currentSet, mySetWins, opSetWins, myLineup, opLineup, myScore, opScore, servingTeam, logs
  });

  // Helper to push state to history before modification
  const pushHistory = () => {
    const current = getCurrentState();
    setHistory(prev => [...prev, current]);
    setFuture([]); // Clear redo stack on new action
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    
    const previous = history[history.length - 1];
    const current = getCurrentState();

    setFuture(prev => [current, ...prev]); // Push current to future
    setHistory(prev => prev.slice(0, -1)); // Pop from history

    // Restore state
    setCurrentSet(previous.currentSet);
    setMySetWins(previous.mySetWins);
    setOpSetWins(previous.opSetWins);
    setMyLineup(previous.myLineup);
    setOpLineup(previous.opLineup);
    setMyScore(previous.myScore);
    setOpScore(previous.opScore);
    setServingTeam(previous.servingTeam);
    setLogs(previous.logs);
  };

  const handleRedo = () => {
    if (future.length === 0) return;

    const next = future[0];
    const current = getCurrentState();

    setHistory(prev => [...prev, current]); // Push current to history
    setFuture(prev => prev.slice(1)); // Pop from future

    // Restore state
    setCurrentSet(next.currentSet);
    setMySetWins(next.mySetWins);
    setOpSetWins(next.opSetWins);
    setMyLineup(next.myLineup);
    setOpLineup(next.opLineup);
    setMyScore(next.myScore);
    setOpScore(next.opScore);
    setServingTeam(next.servingTeam);
    setLogs(next.logs);
  };

  const handleGameStart = (config: TeamConfig, initialMyLineup: Lineup, initialOpLineup: Lineup, initialServingTeam: TeamSide) => {
    setTeamConfig(config);
    setMyLineup(initialMyLineup);
    setOpLineup(initialOpLineup);
    setMyScore(0);
    setOpScore(0);
    setServingTeam(initialServingTeam);
    setHistory([]); 
    setFuture([]);
    setView('game');
  };

  const handleNewMatch = () => {
    setTeamConfig({ matchName: '', myName: '', opName: '' });
    setMyLineup({ 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' });
    setOpLineup({ 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' });
    setCurrentSet(1);
    setMySetWins(0);
    setOpSetWins(0);
    setLogs([]);
    setHistory([]);
    setFuture([]);
    setView('setup');
  };

  const handleNextSet = () => {
    pushHistory(); 
    if (myScore > opScore) {
      setMySetWins(prev => prev + 1);
    } else if (opScore > myScore) {
      setOpSetWins(prev => prev + 1);
    }
    setCurrentSet(prev => prev + 1);
    setView('setup'); 
  };

  const handleGameAction = (
    newLog: LogEntry | null, 
    scoreUpdate: { isMyPoint: boolean } | null,
    lineupUpdate: { isMyTeam: boolean, newLineup: Lineup } | null,
    newServingTeam: TeamSide | null
  ) => {
    pushHistory();
    if (newLog) {
      setLogs(prev => [...prev, { ...newLog, setNumber: currentSet }]);
    }
    if (scoreUpdate) {
      if (scoreUpdate.isMyPoint) setMyScore(prev => prev + 1);
      else setOpScore(prev => prev + 1);
    }
    if (lineupUpdate) {
       if (lineupUpdate.isMyTeam) setMyLineup(lineupUpdate.newLineup);
       else setOpLineup(lineupUpdate.newLineup);
    }
    if (newServingTeam) {
      setServingTeam(newServingTeam);
    }
  };

  const handleLoadGame = (savedState: GameState, config: TeamConfig) => {
    setTeamConfig(config);
    setCurrentSet(savedState.currentSet || 1); 
    setMySetWins(savedState.mySetWins || 0);
    setOpSetWins(savedState.opSetWins || 0);
    setMyLineup(savedState.myLineup);
    setOpLineup(savedState.opLineup);
    setMyScore(savedState.myScore);
    setOpScore(savedState.opScore);
    setServingTeam(savedState.servingTeam);
    setLogs(savedState.logs);
    setHistory([]);
    setFuture([]);
  };

  if (authLoading) {
    return <div className="h-full w-full bg-neutral-900 flex items-center justify-center text-white">Loading...</div>;
  }

  // --- LOGIN VIEW ---
  if (!user) {
    return (
      <div className="h-full w-full bg-neutral-900 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
        <div className="mb-8 shrink-0">
            <h1 className="text-4xl font-black text-white mb-2">VolleyScout Pro</h1>
            <p className="text-gray-400">專業排球數據記錄工具</p>
        </div>
        
        <div className="bg-neutral-800 p-8 rounded-2xl shadow-xl w-full max-w-sm border border-neutral-700">
           
           {/* EMAIL / PASSWORD FORM */}
           <form onSubmit={handleEmailAuth} className="flex flex-col gap-3 mb-6">
                <div className="text-left">
                    <label className="text-xs text-gray-400 font-bold ml-1 mb-1 block">電子郵件 (Email)</label>
                    <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-neutral-700 border border-neutral-600 rounded-lg p-3 text-white focus:border-accent focus:outline-none"
                        placeholder="example@email.com"
                        required
                    />
                </div>
                <div className="text-left">
                    <label className="text-xs text-gray-400 font-bold ml-1 mb-1 block">密碼 (Password)</label>
                    <input 
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-neutral-700 border border-neutral-600 rounded-lg p-3 text-white focus:border-accent focus:outline-none"
                        placeholder="******"
                        required
                    />
                </div>
                
                {authError && (
                    <div className="text-red-400 text-sm font-bold bg-red-900/20 p-2 rounded border border-red-900/50">
                        {authError}
                    </div>
                )}

                <button 
                    type="submit"
                    className="w-full bg-accent hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-colors mt-2"
                >
                    {isSignUp ? '註冊帳號' : '登入'}
                </button>

                <div className="flex justify-center text-sm text-gray-400 gap-1">
                    {isSignUp ? "已有帳號？" : "還沒有帳號？"}
                    <button 
                        type="button"
                        onClick={() => { setIsSignUp(!isSignUp); setAuthError(null); }}
                        className="text-accent hover:underline font-bold"
                    >
                        {isSignUp ? "直接登入" : "立即註冊"}
                    </button>
                </div>
           </form>

           {/* DIVIDER */}
           <div className="flex items-center gap-3 mb-6">
               <div className="h-px bg-neutral-600 flex-1"></div>
               <span className="text-gray-500 text-xs">OR</span>
               <div className="h-px bg-neutral-600 flex-1"></div>
           </div>

           {/* GOOGLE LOGIN */}
           <button 
             onClick={handleGoogleLogin}
             className="w-full bg-white hover:bg-gray-100 text-neutral-900 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-3 transition-colors"
           >
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24px" height="24px">
                <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
                <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
                <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
             </svg>
             Google 登入
           </button>
           
           <div className="mt-6 pt-6 border-t border-neutral-700">
               <div className="text-xs text-gray-500">
                   Firebase Config loaded.
               </div>
           </div>
        </div>
      </div>
    );
  }

  // --- MAIN APP ---
  return (
    <div className="h-full w-full bg-neutral-900 flex justify-center">
      <div className="w-full max-w-[430px] bg-neutral-900 flex flex-col relative shadow-2xl border-x border-neutral-800 h-full">
        {/* User Info Bar */}
        <div className="bg-neutral-950 px-4 py-2 flex justify-between items-center text-xs border-b border-neutral-800 shrink-0">
             <div className="text-gray-400 flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-green-500"></div>
                 {user.email}
             </div>
             <button onClick={handleLogout} className="text-red-400 hover:text-red-300 font-bold">登出</button>
        </div>

        {view === 'setup' ? (
          <SetupView 
            initialConfig={teamConfig}
            initialMyLineup={myLineup}
            initialOpLineup={opLineup}
            onStart={handleGameStart} 
          />
        ) : (
          <GameView 
            user={user}
            teamConfig={teamConfig}
            currentSet={currentSet}
            mySetWins={mySetWins}
            opSetWins={opSetWins}
            initialMyLineup={myLineup}
            initialOpLineup={opLineup}
            myScore={myScore}
            opScore={opScore}
            servingTeam={servingTeam}
            logs={logs}
            onGameAction={handleGameAction}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onLoadGame={handleLoadGame}
            onNewSet={handleNextSet}
            canUndo={history.length > 0}
            canRedo={future.length > 0}
            onExit={handleNewMatch}
          />
        )}
      </div>
    </div>
  );
};

export default App;