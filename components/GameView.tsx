import React, { useState } from 'react';
import { Lineup, TeamConfig, LogEntry, Position, ActionType, ActionQuality, ResultType, Coordinate, TeamSide, SavedGame, GameState } from '../types';
import { Court } from './Court';
import { StatsOverlay } from './StatsOverlay';
import { User } from 'firebase/auth';
import { saveMatchToCloud, getMatchesFromCloud, deleteMatchFromCloud, logout } from '../services/firebaseService';

interface GameViewProps {
  currentUser: User; // Add user prop
  teamConfig: TeamConfig;
  currentSet: number;
  mySetWins: number;
  opSetWins: number;
  initialMyLineup: Lineup;
  initialOpLineup: Lineup;
  myScore: number;
  opScore: number;
  servingTeam: TeamSide;
  logs: LogEntry[];
  onGameAction: (
    newLog: LogEntry | null, 
    scoreUpdate: { isMyPoint: boolean } | null,
    lineupUpdate: { isMyTeam: boolean, newLineup: Lineup } | null,
    servingTeamUpdate: TeamSide | null
  ) => void;
  onUndo: () => void;
  onRedo: () => void;
  onLoadGame: (savedState: GameState, config: TeamConfig) => void;
  onNewSet: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onExit: () => void;
}

type GameStep = 'SELECT_PLAYER' | 'SELECT_ACTION' | 'SELECT_QUALITY' | 'RECORD_LOCATION' | 'SELECT_RESULT';

export const GameView: React.FC<GameViewProps> = ({
  currentUser,
  teamConfig,
  currentSet,
  mySetWins,
  opSetWins,
  initialMyLineup,
  initialOpLineup,
  myScore,
  opScore,
  servingTeam,
  logs,
  onGameAction,
  onUndo,
  onRedo,
  onLoadGame,
  onNewSet,
  canUndo,
  canRedo,
  onExit
}) => {
  const [step, setStep] = useState<GameStep>('SELECT_PLAYER');
  const [showStats, setShowStats] = useState(false);
  
  // Selection States
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [selectedIsMyTeam, setSelectedIsMyTeam] = useState<boolean>(true);
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<ActionQuality>(ActionQuality.NORMAL);
  const [startCoord, setStartCoord] = useState<Coordinate | null>(null);
  const [endCoord, setEndCoord] = useState<Coordinate | null>(null);
  
  const [showSubInput, setShowSubInput] = useState(false);
  const [subNumber, setSubNumber] = useState('');

  // --- Save / Load Logic State ---
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false); // New: for async operations
  
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedFiles, setSavedFiles] = useState<{key: string, name: string, date: string, fullData: SavedGame}[]>([]);

  // System Modal State
  const [modalConfig, setModalConfig] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: 'info' | 'confirm';
    confirmLabel?: string;
    onConfirm?: () => void;
  }>({ show: false, title: '', message: '', type: 'info' });

  const showInfo = (title: string, message: string) => {
    setModalConfig({ show: true, title, message, type: 'info', confirmLabel: '確定' });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void, confirmLabel: string = '確定') => {
    setModalConfig({ show: true, title, message, type: 'confirm', onConfirm, confirmLabel });
  };

  const closeModal = () => {
    setModalConfig(prev => ({ ...prev, show: false }));
  };

  const handleConfirm = () => {
    if (modalConfig.onConfirm) {
        modalConfig.onConfirm();
    }
    closeModal();
  };

  // Rotation Helper
  const getRotatedLineup = (lineup: Lineup): Lineup => ({
      1: lineup[2],
      6: lineup[1],
      5: lineup[6],
      4: lineup[5],
      3: lineup[4],
      2: lineup[3],
  });

  const handleRotation = (isMyTeam: boolean) => {
    if (step !== 'SELECT_PLAYER') return;
    const currentLineup = isMyTeam ? initialMyLineup : initialOpLineup;
    const newLineup = getRotatedLineup(currentLineup);
    onGameAction(null, null, { isMyTeam, newLineup }, null);
  };

  const startSubFlow = () => {
    setShowSubInput(true);
    setSubNumber('');
  };

  const confirmSub = () => {
    if (!selectedPos) return;
    const newNum = subNumber.trim();
    const currentLineup = selectedIsMyTeam ? initialMyLineup : initialOpLineup;
    const oldNum = currentLineup[selectedPos];
    
    if (newNum === '') {
        showInfo('錯誤', '請輸入背號');
        return;
    }
    if (Object.values(currentLineup).includes(newNum)) {
        showInfo('錯誤', `背號 #${newNum} 已在場上`);
        return;
    }

    const newLineup = { ...currentLineup, [selectedPos]: newNum };
    const subLog: LogEntry = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      setNumber: currentSet,
      myScore,
      opScore,
      playerNumber: oldNum,
      position: selectedPos,
      action: ActionType.SUB,
      quality: ActionQuality.NORMAL,
      result: ResultType.NORMAL,
      note: `換人 (${selectedIsMyTeam ? '我方' : '對方'}): #${oldNum} -> #${newNum}`,
      servingTeam
    };

    onGameAction(subLog, null, { isMyTeam: selectedIsMyTeam, newLineup }, null);
    setShowSubInput(false);
    resetTurn();
  };

  const handlePlayerClick = (pos: Position, isMyTeam: boolean, coord: Coordinate) => {
    if (step !== 'SELECT_PLAYER') return;
    setSelectedPos(pos);
    setSelectedIsMyTeam(isMyTeam);
    setStartCoord(coord); 
    setStep('SELECT_ACTION');
    setSelectedQuality(ActionQuality.NORMAL);
  };

  const handleActionSelect = (action: ActionType) => {
    if (action === ActionType.SUB) {
      startSubFlow();
      return;
    }
    setSelectedAction(action);
    setStep('SELECT_QUALITY');
  };

  const handleQualitySelect = (quality: ActionQuality) => {
    setSelectedQuality(quality);
    setStep('RECORD_LOCATION');
  };

  const handleLocationRecord = (start: Coordinate, end: Coordinate) => {
    setStartCoord(start);
    setEndCoord(end);
    setStep('SELECT_RESULT');
  };

  const handleSkipLocation = () => {
    setEndCoord(null);
    setStep('SELECT_RESULT');
  }

  const handleResultSelect = (result: ResultType) => {
    if (!selectedPos || !selectedAction) return;

    const lineup = selectedIsMyTeam ? initialMyLineup : initialOpLineup;
    const playerNumber = lineup[selectedPos];

    let scoreUpdate = null;
    let newServingTeam: TeamSide | null = null;
    let lineupUpdate = null;

    if (result === ResultType.POINT) {
        scoreUpdate = { isMyPoint: selectedIsMyTeam };
        const pointWinner = selectedIsMyTeam ? 'me' : 'op';
        if (pointWinner !== servingTeam) {
            newServingTeam = pointWinner;
            const lineToRotate = pointWinner === 'me' ? initialMyLineup : initialOpLineup;
            lineupUpdate = { 
                isMyTeam: pointWinner === 'me', 
                newLineup: getRotatedLineup(lineToRotate) 
            };
        }
    } 
    else if (result === ResultType.ERROR) {
        scoreUpdate = { isMyPoint: !selectedIsMyTeam };
        const pointWinner = !selectedIsMyTeam ? 'me' : 'op';
        if (pointWinner !== servingTeam) {
            newServingTeam = pointWinner;
            const lineToRotate = pointWinner === 'me' ? initialMyLineup : initialOpLineup;
            lineupUpdate = { 
                isMyTeam: pointWinner === 'me', 
                newLineup: getRotatedLineup(lineToRotate) 
            };
        }
    }

    const nextMyScore = scoreUpdate ? (scoreUpdate.isMyPoint ? myScore + 1 : myScore) : myScore;
    const nextOpScore = scoreUpdate ? (!scoreUpdate.isMyPoint ? opScore + 1 : opScore) : opScore;

    const newLog: LogEntry = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      setNumber: currentSet,
      myScore: nextMyScore,
      opScore: nextOpScore,
      playerNumber,
      position: selectedPos,
      action: selectedAction,
      quality: selectedQuality,
      result,
      startCoord: startCoord || undefined,
      endCoord: endCoord || undefined,
      note: selectedIsMyTeam ? teamConfig.myName : teamConfig.opName,
      servingTeam: newServingTeam || servingTeam
    };

    onGameAction(newLog, scoreUpdate, lineupUpdate, newServingTeam);
    resetTurn();
  };

  const resetTurn = () => {
    setStep('SELECT_PLAYER');
    setSelectedPos(null);
    setSelectedAction(null);
    setSelectedQuality(ActionQuality.NORMAL);
    setStartCoord(null);
    setEndCoord(null);
  };

  const actionMap: Record<ActionType, string> = {
      [ActionType.SERVE]: '發球',
      [ActionType.RECEIVE]: '接發',
      [ActionType.SET]: '舉球',
      [ActionType.ATTACK]: '攻擊',
      [ActionType.BLOCK]: '攔網',
      [ActionType.DIG]: '防守',
      [ActionType.SUB]: '換人'
  };

  const resultMap: Record<ResultType, string> = {
      [ResultType.POINT]: '得分',
      [ResultType.ERROR]: '失誤',
      [ResultType.NORMAL]: '一般'
  };

  const qualityMap: Record<ActionQuality, string> = {
      [ActionQuality.PERFECT]: '# 到位',
      [ActionQuality.GOOD]: '+ 良好',
      [ActionQuality.NORMAL]: '! 普通',
      [ActionQuality.POOR]: '- 不到位'
  };

  // --- SAVE Logic (Cloud) ---
  const handleOpenSave = () => {
    const dateStr = new Date().toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' }).replace(/\//g, '');
    const timeStr = new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }).replace(/:/g, '');
    const defaultName = `${teamConfig.matchName || 'match'}_${dateStr}${timeStr}`;
    setSaveFileName(defaultName);
    setShowSaveModal(true);
  };

  const handleConfirmSave = async () => {
    if (!saveFileName.trim()) {
        showInfo('錯誤', '請輸入檔案名稱');
        return;
    }

    setIsProcessing(true);
    const currentState: GameState = {
      currentSet, mySetWins, opSetWins, myLineup: initialMyLineup, opLineup: initialOpLineup, myScore, opScore, servingTeam, logs
    };
    
    const saveObject: SavedGame = {
      config: teamConfig,
      state: currentState,
      savedAt: Date.now()
    };

    try {
      await saveMatchToCloud(currentUser.uid, saveObject, saveFileName.trim());
      setShowSaveModal(false);
      showInfo('儲存成功', `檔案 "${saveFileName}" 已上傳雲端！`);
    } catch (e) {
      showInfo('儲存失敗', '請檢查網路連線。');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- LOAD Logic (Cloud) ---
  const handleOpenLoad = async () => {
    setIsProcessing(true);
    try {
        const matches = await getMatchesFromCloud(currentUser.uid);
        setSavedFiles(matches);
        setShowLoadModal(true);
    } catch (e) {
        showInfo('錯誤', '無法讀取雲端存檔');
    } finally {
        setIsProcessing(false);
    }
  };

  const handleLoadFile = (matchData: SavedGame, name: string) => {
    showConfirm(
        '讀取紀錄',
        `確定要讀取 "${name}" 嗎？\n當前的比賽進度將會遺失。`,
        () => {
            onLoadGame(matchData.state, matchData.config);
            resetTurn();
            setShowLoadModal(false);
        },
        '確認讀取'
    );
  };

  const handleDeleteFile = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    showConfirm(
        '刪除存檔',
        '確定要永久刪除此雲端存檔嗎？',
        async () => {
            try {
                await deleteMatchFromCloud(docId);
                setSavedFiles(prev => prev.filter(f => f.key !== docId));
            } catch (e) {
                showInfo('錯誤', '刪除失敗');
            }
        },
        '確認刪除'
    );
  };

  const handleNewGameClick = () => {
    showConfirm(
        '開新比賽',
        '確定要開新比賽嗎？\n未儲存的紀錄將會遺失，並回到設定頁面。',
        () => {
            onExit();
        },
        '確認開新局'
    );
  };
  
  const handleNewSetClick = () => {
      let projectedMyWins = mySetWins;
      let projectedOpWins = opSetWins;
      if (myScore > opScore) projectedMyWins++;
      else if (opScore > myScore) projectedOpWins++;
      
      showConfirm(
          '新局數',
          `確定要結束第 ${currentSet} 局，並開始第 ${currentSet + 1} 局嗎？\n\n` +
          `目前局數比分將變為: ${projectedMyWins}:${projectedOpWins}\n` +
          `(將回到設定頁面重新確認先發陣容)`,
          () => {
              onNewSet();
          },
          '開始新一局'
      );
  };

  const handleExitClick = () => {
      showConfirm(
          '登出',
          '確定要登出帳號嗎？',
          async () => {
              await logout();
              // Auth listener in App.tsx will handle the rest
          },
          '確認登出'
      );
  }

  const handleExportCSV = () => {
    const bom = "\uFEFF";
    const header = "時間,局數,我方得分,對方得分,發球方,隊伍,位置,背號,動作,品質,結果,起點X,起點Y,終點X,終點Y\n";
    
    const rows = logs.map(l => {
        const time = new Date(l.timestamp).toLocaleTimeString('zh-TW', { hour12: false });
        const startX = l.startCoord ? l.startCoord.x.toFixed(2) : '';
        const startY = l.startCoord ? l.startCoord.y.toFixed(2) : '';
        const endX = l.endCoord ? l.endCoord.x.toFixed(2) : '';
        const endY = l.endCoord ? l.endCoord.y.toFixed(2) : '';
        
        const actionStr = actionMap[l.action] || l.action;
        const qualityStr = qualityMap[l.quality] || ''; // Use map directly
        const resultStr = resultMap[l.result] || l.result;
        const serveStr = l.servingTeam === 'me' ? teamConfig.myName : teamConfig.opName;
        const setNum = l.setNumber || 1;

        return `${time},${setNum},${l.myScore},${l.opScore},${serveStr},${l.note},${l.position},${l.playerNumber},${actionStr},${qualityStr},${resultStr},${startX},${startY},${endX},${endY}`;
    }).join("\n");
    
    const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const dateStr = new Date().toISOString().slice(0, 10); 
    link.setAttribute("download", `VolleyScout_Export_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Modals Render ---
  const renderSaveModal = () => {
      if (!showSaveModal) return null;
      return (
          <div className="absolute inset-0 z-[110] bg-black/90 flex flex-col justify-center items-center p-6 animate-fade-in">
              <h3 className="text-white text-xl font-bold mb-6">儲存至雲端</h3>
              <div className="w-full max-w-xs mb-6">
                  <label className="text-sm text-gray-400 block mb-2">檔案名稱</label>
                  <input 
                    type="text"
                    value={saveFileName}
                    onChange={(e) => setSaveFileName(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-600 text-white p-4 rounded-xl focus:border-emerald-500 focus:outline-none"
                    placeholder="輸入名稱..."
                    disabled={isProcessing}
                  />
              </div>
              <div className="flex gap-3 w-full max-w-xs">
                  <button 
                    onClick={() => setShowSaveModal(false)}
                    className="flex-1 bg-neutral-700 text-white font-bold py-3 rounded-xl"
                    disabled={isProcessing}
                  >
                      取消
                  </button>
                  <button 
                    onClick={handleConfirmSave}
                    className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2"
                    disabled={isProcessing}
                  >
                      {isProcessing ? '上傳中...' : '確認儲存'}
                  </button>
              </div>
          </div>
      );
  };

  const renderLoadModal = () => {
      if (!showLoadModal) return null;
      return (
          <div className="absolute inset-0 z-[110] bg-black/90 flex flex-col p-6 animate-fade-in">
              <div className="flex justify-between items-center mb-4 shrink-0">
                  <h3 className="text-white text-xl font-bold">雲端存檔</h3>
                  <button 
                    onClick={() => setShowLoadModal(false)}
                    className="text-gray-400 hover:text-white px-2 py-1"
                  >
                    關閉
                  </button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                  {savedFiles.length === 0 ? (
                      <div className="text-gray-500 text-center py-10">尚無雲端紀錄</div>
                  ) : (
                      savedFiles.map((file) => (
                          <div key={file.key} onClick={() => handleLoadFile(file.fullData, file.name)} className="bg-neutral-800 border border-neutral-700 p-4 rounded-xl active:bg-neutral-700 flex justify-between items-center cursor-pointer group">
                              <div>
                                  <div className="text-white font-bold text-lg mb-1">{file.name}</div>
                                  <div className="text-xs text-gray-400">{file.date}</div>
                              </div>
                              <button 
                                onClick={(e) => handleDeleteFile(file.key, e)}
                                className="p-3 text-neutral-600 hover:text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"
                              >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                              </button>
                          </div>
                      ))
                  )}
              </div>

              <div className="shrink-0 pt-2">
                <button 
                    onClick={() => setShowLoadModal(false)}
                    className="w-full bg-neutral-700 active:bg-neutral-600 text-white font-bold py-4 rounded-xl text-lg shadow-lg border border-neutral-600"
                >
                    取消
                </button>
              </div>
          </div>
      );
  };

  const renderSystemModal = () => {
      if (!modalConfig.show) return null;
      return (
          <div className="absolute inset-0 z-[120] bg-black/80 flex items-center justify-center p-6 animate-fade-in">
              <div className="bg-neutral-800 border border-neutral-600 p-6 rounded-2xl w-full max-w-xs shadow-2xl flex flex-col gap-4">
                  <h3 className="text-xl font-bold text-white text-center">{modalConfig.title}</h3>
                  <p className="text-gray-300 text-center whitespace-pre-wrap">{modalConfig.message}</p>
                  <div className="flex gap-3 mt-2">
                      {modalConfig.type === 'confirm' && (
                          <button 
                            onClick={closeModal}
                            className="flex-1 bg-neutral-700 hover:bg-neutral-600 text-white py-3 rounded-xl font-bold"
                          >
                              取消
                          </button>
                      )}
                      <button 
                        onClick={modalConfig.type === 'confirm' ? handleConfirm : closeModal}
                        className={`flex-1 py-3 rounded-xl font-bold text-white
                            ${modalConfig.type === 'confirm' ? 'bg-red-600 hover:bg-red-500' : 'bg-accent hover:bg-blue-500'}
                        `}
                      >
                          {modalConfig.confirmLabel || '確定'}
                      </button>
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-white relative overflow-hidden">
      
      {/* 1. Top Bar */}
      <div className="bg-neutral-800 border-b border-neutral-700 shadow-md z-10 shrink-0 flex flex-col">
          <div className="flex justify-between items-center p-2 border-b border-neutral-700/50">
             <div className="flex gap-2 items-center flex-1">
                 <button 
                    onClick={handleExitClick}
                    className="w-10 h-10 rounded-full bg-red-900/30 border border-red-900/50 text-red-500 flex items-center justify-center font-bold mr-2 hover:bg-red-900/50 transition-colors"
                    title="登出"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                 </button>
                 <button 
                    onClick={onUndo} 
                    disabled={!canUndo}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xl border-2 transition-all active:scale-95 shadow-sm
                        ${canUndo ? 'bg-amber-500 text-black border-amber-600' : 'bg-neutral-800 text-neutral-600 border-neutral-700'}`}
                 >
                    ↶
                 </button>
                 <button 
                    onClick={onRedo} 
                    disabled={!canRedo}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xl border-2 transition-all active:scale-95 shadow-sm
                        ${canRedo ? 'bg-blue-600 text-white border-blue-700' : 'bg-neutral-800 text-neutral-600 border-neutral-700'}`}
                 >
                    ↷
                 </button>
             </div>
             
             <div className="font-bold text-white bg-neutral-900/50 px-3 py-1 rounded-lg border border-neutral-700/50 mx-2 text-sm whitespace-nowrap">
                 局數 <span className="text-lg">{mySetWins} : {opSetWins}</span>
             </div>
             
             <div className="flex-1 flex justify-end">
                <button onClick={handleExportCSV} className="text-[10px] text-accent font-bold border border-accent px-2 py-1 rounded hover:bg-accent hover:text-white transition-colors">匯出 CSV</button>
             </div>
          </div>

          {/* Row 2: Scoreboard */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 py-3 bg-neutral-800">
             <div className="flex items-center justify-between gap-1 overflow-hidden">
                <button
                    onClick={() => handleRotation(true)}
                    disabled={step !== 'SELECT_PLAYER'}
                    className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all active:scale-95 shrink-0
                        ${step === 'SELECT_PLAYER' ? 'bg-neutral-700 text-white border-neutral-500' : 'bg-transparent text-neutral-700 border-neutral-800'}`}
                >
                    ↻
                </button>
                <div className={`flex items-center justify-end gap-2 flex-1 overflow-hidden text-right ${servingTeam === 'me' ? 'opacity-100' : 'opacity-60'}`}>
                    {servingTeam === 'me' && <span className="text-sm shrink-0 animate-bounce">🏐</span>}
                    <span className="text-lg sm:text-xl font-bold text-white truncate leading-tight">{teamConfig.myName}</span>
                    <span className="text-4xl font-black text-accent leading-none ml-1 tabular-nums">{myScore}</span>
                </div>
             </div>
             
             <div className="text-neutral-600 font-thin text-2xl pb-1">:</div>
             
             <div className="flex items-center justify-between gap-1 overflow-hidden">
                <div className={`flex items-center justify-start gap-2 flex-1 overflow-hidden text-left ${servingTeam === 'op' ? 'opacity-100' : 'opacity-60'}`}>
                    <span className="text-4xl font-black text-red-500 leading-none mr-1 tabular-nums">{opScore}</span>
                    <span className="text-lg sm:text-xl font-bold text-white truncate leading-tight">{teamConfig.opName}</span>
                    {servingTeam === 'op' && <span className="text-sm shrink-0 animate-bounce">🏐</span>}
                </div>
                <button
                    onClick={() => handleRotation(false)}
                    disabled={step !== 'SELECT_PLAYER'}
                    className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all active:scale-95 shrink-0
                        ${step === 'SELECT_PLAYER' ? 'bg-neutral-700 text-red-400 border-neutral-500' : 'bg-transparent text-neutral-700 border-neutral-800'}`}
                >
                    ↻
                </button>
             </div>
          </div>
      </div>

      {/* 2. Court */}
      <div className="flex-1 relative overflow-hidden bg-[#222]">
        <div className="absolute top-2 left-0 right-0 z-20 flex justify-center pointer-events-none">
            <div className="bg-black/60 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-white shadow-lg border border-white/10">
                {step === 'SELECT_PLAYER' && "點選場上球員"}
                {step === 'SELECT_ACTION' && "選擇動作"}
                {step === 'SELECT_QUALITY' && "選擇品質"}
                {step === 'RECORD_LOCATION' && "拖曳繪製落點"}
                {step === 'SELECT_RESULT' && "選擇結果"}
            </div>
        </div>

        {step === 'RECORD_LOCATION' && (
             <div className="absolute bottom-4 right-4 z-30">
                 <button 
                    onClick={handleSkipLocation}
                    className="bg-neutral-800/80 backdrop-blur border border-white/20 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg"
                 >
                    跳過紀錄落點 &rarr;
                 </button>
             </div>
        )}

        <Court 
            myName={teamConfig.myName}
            opName={teamConfig.opName}
            myLineup={initialMyLineup}
            opLineup={initialOpLineup}
            step={step}
            onPlayerClick={handlePlayerClick}
            onLocationRecord={handleLocationRecord}
        />
      </div>

      {/* 3. Bottom Controls */}
      {step === 'SELECT_PLAYER' && (
        <div className="flex-none bg-neutral-900 border-t border-neutral-800 p-3 pb-6 shadow-[0_-4px_20px_rgba(0,0,0,0.8)] z-[100]">
             <div className="grid grid-cols-5 gap-2 max-w-[430px] mx-auto">
                 <button 
                    type="button"
                    onClick={handleOpenSave}
                    className="w-full h-14 bg-emerald-900 hover:bg-emerald-800 text-emerald-100 text-xs sm:text-[10px] rounded-lg border border-emerald-700 font-bold active:scale-95 transition-all flex flex-col items-center justify-center gap-1 shadow-sm cursor-pointer touch-manipulation select-none"
                 >
                     {isProcessing ? (
                         <span className="animate-spin text-lg">↻</span>
                     ) : (
                        <svg className="pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                     )}
                    存檔(雲端)
                 </button>
                 
                 <button 
                    type="button"
                    onClick={handleOpenLoad}
                    className="w-full h-14 bg-orange-900 hover:bg-orange-800 text-orange-100 text-xs sm:text-[10px] rounded-lg border border-orange-700 font-bold active:scale-95 transition-all flex flex-col items-center justify-center gap-1 shadow-sm cursor-pointer touch-manipulation select-none"
                 >
                    {isProcessing ? (
                         <span className="animate-spin text-lg">↻</span>
                     ) : (
                        <svg className="pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                     )}
                    讀檔(雲端)
                 </button>

                 <button 
                    type="button"
                    onClick={() => setShowStats(true)}
                    className="w-full h-14 bg-neutral-700 hover:bg-neutral-600 text-white text-xs sm:text-[10px] rounded-lg border border-neutral-500 font-bold active:scale-95 transition-all flex flex-col items-center justify-center gap-1 shadow-sm cursor-pointer touch-manipulation select-none"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                    紀錄
                 </button>

                 <button 
                    type="button"
                    onClick={handleNewSetClick}
                    className="w-full h-14 bg-purple-900 hover:bg-purple-800 text-purple-100 text-xs sm:text-[10px] rounded-lg border border-purple-700 font-bold active:scale-95 transition-all flex flex-col items-center justify-center gap-1 shadow-sm cursor-pointer touch-manipulation select-none"
                 >
                    <span className="text-lg font-black leading-none">+1</span>
                    新局數
                 </button>

                 <button 
                    type="button"
                    onClick={handleNewGameClick}
                    className="w-full h-14 bg-blue-900 hover:bg-blue-800 text-blue-100 text-xs sm:text-[10px] rounded-lg border border-blue-700 font-bold active:scale-95 transition-all flex flex-col items-center justify-center gap-1 shadow-sm cursor-pointer touch-manipulation select-none"
                 >
                    <svg className="pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                    新比賽
                 </button>
             </div>
        </div>
      )}

      {step === 'SELECT_ACTION' && renderSystemModal()} 
      {/* Note: renderActionModal etc. logic was implicit in previous code, 
          assuming they are rendered via conditional rendering in the JSX like before.
          The previous structure had them inline. I preserved the logic structure.
          Below are the re-inserted modals that were in the original file but truncated for brevity in the diff logic if not careful.
          I will ensure the return block contains them. */}
          
      {/* 4. Modals - Re-implementing the original render logic for game steps */}
      {step === 'SELECT_ACTION' && (
        <div className="absolute inset-0 z-50 bg-black/80 flex flex-col justify-center items-center p-6 animate-fade-in">
          <h3 className="text-white text-xl font-bold mb-4">#{selectedIsMyTeam ? initialMyLineup[selectedPos!] : initialOpLineup[selectedPos!]} 執行動作</h3>
          <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
            {[ActionType.SERVE, ActionType.RECEIVE, ActionType.SET, ActionType.ATTACK, ActionType.BLOCK, ActionType.DIG].map(act => (
               <button key={act} onClick={() => handleActionSelect(act)} className="bg-neutral-800 border border-neutral-600 hover:bg-neutral-700 text-white font-bold py-5 rounded-xl shadow-lg text-lg">
                 {actionMap[act]}
               </button>
            ))}
            <button onClick={() => handleActionSelect(ActionType.SUB)} className="col-span-2 bg-neutral-800 border border-yellow-600/50 hover:bg-neutral-700 text-yellow-400 font-bold py-4 rounded-xl shadow-lg mt-2">🔄 換人 (Substitute)</button>
          </div>
          <button onClick={resetTurn} className="mt-8 text-gray-400 underline">取消</button>
        </div>
      )}

      {step === 'SELECT_QUALITY' && (
        <div className="absolute inset-0 z-50 bg-black/80 flex flex-col justify-center items-center p-6 animate-fade-in">
            <h3 className="text-white text-xl font-bold mb-2">#{selectedIsMyTeam ? initialMyLineup[selectedPos!] : initialOpLineup[selectedPos!]} {actionMap[selectedAction!]}</h3>
            <p className="text-gray-400 text-sm mb-6">選擇動作品質</p>
            <div className="flex flex-col gap-3 w-full max-w-xs">
                <button onClick={() => handleQualitySelect(ActionQuality.PERFECT)} className="bg-emerald-700 hover:bg-emerald-600 border border-emerald-500 text-white font-bold py-4 rounded-xl text-xl flex items-center justify-between px-6"><span>到位 (Perfect)</span><span className="text-2xl">#</span></button>
                <button onClick={() => handleQualitySelect(ActionQuality.GOOD)} className="bg-blue-700 hover:bg-blue-600 border border-blue-500 text-white font-bold py-4 rounded-xl text-xl flex items-center justify-between px-6"><span>良好 (Good)</span><span className="text-2xl">+</span></button>
                <button onClick={() => handleQualitySelect(ActionQuality.NORMAL)} className="bg-neutral-700 hover:bg-neutral-600 border border-neutral-500 text-gray-200 font-bold py-4 rounded-xl text-xl flex items-center justify-between px-6"><span>普通 (Normal)</span><span className="text-2xl">!</span></button>
                <button onClick={() => handleQualitySelect(ActionQuality.POOR)} className="bg-orange-700 hover:bg-orange-600 border border-orange-500 text-white font-bold py-4 rounded-xl text-xl flex items-center justify-between px-6"><span>不到位 (Poor)</span><span className="text-2xl">-</span></button>
            </div>
            <button onClick={() => setStep('SELECT_ACTION')} className="mt-8 text-gray-400 underline">返回</button>
        </div>
      )}

      {step === 'SELECT_RESULT' && (
        <div className="absolute inset-0 z-50 bg-black/80 flex flex-col justify-center items-center p-6 animate-fade-in">
          <h3 className="text-white text-xl font-bold mb-2">動作結果</h3>
          <div className="mb-6 text-center bg-neutral-800/80 px-4 py-2 rounded-lg border border-neutral-700">
              <span className="text-accent font-bold text-lg">{actionMap[selectedAction!]}</span>
              <span className="mx-2 text-gray-500">|</span>
              <span className="font-bold text-white">{qualityMap[selectedQuality]}</span>
          </div>
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <button onClick={() => handleResultSelect(ResultType.POINT)} className="bg-green-600 hover:bg-green-500 text-white font-bold py-5 rounded-xl text-xl shadow-lg">得分 (POINT)</button>
            <button onClick={() => handleResultSelect(ResultType.NORMAL)} className="bg-neutral-600 hover:bg-neutral-500 text-white font-bold py-5 rounded-xl text-xl shadow-lg">一般 (CONTINUE)</button>
            <button onClick={() => handleResultSelect(ResultType.ERROR)} className="bg-red-600 hover:bg-red-500 text-white font-bold py-5 rounded-xl text-xl shadow-lg">失誤 (ERROR)</button>
          </div>
          <button onClick={resetTurn} className="mt-8 text-gray-400 underline">取消</button>
        </div>
      )}

      {showSubInput && (
          <div className="absolute inset-0 z-[60] bg-black/90 flex flex-col justify-center items-center p-6 animate-fade-in">
              <h3 className="text-white text-xl font-bold mb-4">輸入替補球員背號</h3>
              <input type="tel" autoFocus value={subNumber} onChange={(e) => setSubNumber(e.target.value)} className="bg-neutral-800 border-2 border-accent text-white text-4xl font-black text-center p-4 rounded-xl w-32 mb-6 focus:outline-none" placeholder="#" />
              <div className="flex gap-4 w-full max-w-xs">
                  <button onClick={() => setShowSubInput(false)} className="flex-1 bg-neutral-700 text-white font-bold py-3 rounded-lg">取消</button>
                  <button onClick={confirmSub} className="flex-1 bg-accent text-white font-bold py-3 rounded-lg">確認</button>
              </div>
          </div>
      )}

      {renderSaveModal()}
      {renderLoadModal()}
      {renderSystemModal()}
      
      {showStats && (
        <StatsOverlay 
            logs={logs}
            teamConfig={teamConfig}
            myScore={myScore}
            opScore={opScore}
            mySetWins={mySetWins}
            opSetWins={opSetWins}
            currentSet={currentSet}
            onBack={() => setShowStats(false)}
        />
      )}
    </div>
  );
};
