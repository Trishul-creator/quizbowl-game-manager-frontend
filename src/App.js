import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import "./App.css";

const api = axios.create({
  baseURL: "https://api.quizbowl.game-manager.org",
});

function useInterval(callback, delay) {
  const savedCallback = useRef();

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) {
      return;
    }
    const id = setInterval(() => {
      if (savedCallback.current) {
        savedCallback.current();
      }
    }, delay);
    return () => clearInterval(id);
  }, [delay]);
}

function App() {
  const [page, setPage] = useState("control");
  const gameId = "default";
  const [game, setGame] = useState(null);
  const [loadingGame, setLoadingGame] = useState(false);
  const [bracket, setBracket] = useState(null);
  const [loadingBracket, setLoadingBracket] = useState(false);
  const [editingNames, setEditingNames] = useState(false);
  const [teamAInput, setTeamAInput] = useState("Team A");
  const [teamBInput, setTeamBInput] = useState("Team B");
  const [timerMode, setTimerMode] = useState("tossup");
  const [timerSeconds, setTimerSeconds] = useState(7);
  const [timerRunning, setTimerRunning] = useState(false);
  const [bracketNamesText, setBracketNamesText] = useState("");
  const [pairTeamAId, setPairTeamAId] = useState("");
  const [pairTeamBId, setPairTeamBId] = useState("");
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("authToken") || "");
  const [authRole, setAuthRole] = useState(() => localStorage.getItem("authRole") || "");
  const [authUsername, setAuthUsername] = useState(() => localStorage.getItem("authUsername") || "");
  const [authEmail, setAuthEmail] = useState("");
  const [authView, setAuthView] = useState("login");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [playerTeamId, setPlayerTeamId] = useState("");

  const correctRef = useRef(null);
  const bonusRef = useRef(null);
  const timerEndRef = useRef(null);

  const adminHeaders = () => (authToken ? { "X-Admin-Token": authToken } : {});
  const isAdmin = authRole === "ADMIN";

  const fetchGame = useCallback(async () => {
    try {
      setLoadingGame(true);
      const res = await api.get("/api/game", { params: { gameId } });
      if (isAdmin || !game) {
        setGame(res.data);
        if (!editingNames) {
          setTeamAInput(res.data.teamAName);
          setTeamBInput(res.data.teamBName);
        }
      }
    } catch (err) {
      // no-op for now
    } finally {
      setLoadingGame(false);
    }
  }, [editingNames, gameId, isAdmin, game]);

  const fetchBracket = useCallback(async () => {
    try {
      setLoadingBracket(true);
      const res = await api.get("/api/bracket");
      setBracket(res.data);
    } catch (err) {
      // no-op
    } finally {
      setLoadingBracket(false);
    }
  }, []);

  useEffect(() => {
    fetchGame();
    fetchBracket();
  }, [fetchGame, fetchBracket, gameId]);

  useInterval(() => {
    if (isAdmin) {
      fetchGame();
      fetchBracket();
    }
  }, isAdmin ? 1200 : 5000);

  useEffect(() => {
    const source = new EventSource("https://api.quizbowl.game-manager.org/api/bracket/stream");
    source.addEventListener("bracket", (e) => {
      try {
        const data = JSON.parse(e.data);
        setBracket(data);
      } catch (err) {
        // ignore parse errors
      }
    });
    source.onerror = () => {
      source.close();
    };
    return () => {
      source.close();
    };
  }, []);

  useInterval(() => {
    setTimerSeconds((prev) => {
      if (!timerRunning) {
        return prev;
      }
      const next = prev - 1;
      if (next <= 0) {
        if (timerRunning) {
          setTimerRunning(false);
        }
        if (timerEndRef.current) {
          timerEndRef.current.currentTime = 0;
          timerEndRef.current.play();
        }
        return 0;
      }
      return next;
    });
  }, timerRunning ? 1000 : null);

  useEffect(() => {
    if (bracket && bracket.teams) {
      const available = bracket.teams.filter((t) => !t.eliminated);
      if (!pairTeamAId && available[0]) {
        setPairTeamAId(available[0].id);
      }
      if (!pairTeamBId && available[1]) {
        setPairTeamBId(available[1].id);
      }
    }
  }, [bracket, pairTeamAId, pairTeamBId]);

  const startTimerWithMode = (mode) => {
    setTimerMode(mode);
    setTimerSeconds(mode === "bonus" ? 20 : 7);
    setTimerRunning(true);
  };

  const pauseTimer = () => {
    setTimerRunning(false);
  };

  const resetTimer = () => {
    setTimerRunning(false);
    setTimerSeconds(timerMode === "bonus" ? 20 : 7);
  };

  const timerProgress = () => {
    const total = timerMode === "bonus" ? 20 : 7;
    return Math.max(0, Math.min(1, timerSeconds / total));
  };

  const awardTossup = async (team) => {
    if (isAdmin) {
      await api.post("/api/game/award-tossup", { team }, { params: { gameId }, headers: adminHeaders() });
      if (correctRef.current) {
        correctRef.current.currentTime = 0;
        correctRef.current.play();
      }
      fetchGame();
      return;
    }
    setGame((g) => {
      const base = g || {
        teamAName: teamAInput || "Team A",
        teamBName: teamBInput || "Team B",
        teamAScore: 0,
        teamBScore: 0,
        questionNumber: 1,
        lastTossupWinner: null,
        history: [],
      };
      const next = { ...base, history: [...(base.history || [])] };
      if (team === "A") {
        next.teamAScore = (next.teamAScore || 0) + 10;
        next.lastTossupWinner = "A";
        next.history.push({
          type: "TOSSUP",
          description: `Tossup +10 → ${next.teamAName || "Team A"}`,
          timestamp: Date.now(),
          team: "A",
          points: 10,
        });
      } else if (team === "B") {
        next.teamBScore = (next.teamBScore || 0) + 10;
        next.lastTossupWinner = "B";
        next.history.push({
          type: "TOSSUP",
          description: `Tossup +10 → ${next.teamBName || "Team B"}`,
          timestamp: Date.now(),
          team: "B",
          points: 10,
        });
      }
      return next;
    });
    if (correctRef.current) {
      correctRef.current.currentTime = 0;
      correctRef.current.play();
    }
  };

  const awardBonus = async () => {
    if (isAdmin) {
      await api.post("/api/game/award-bonus", { points: 10 }, { params: { gameId }, headers: adminHeaders() });
      if (bonusRef.current) {
        bonusRef.current.currentTime = 0;
        bonusRef.current.play();
      }
      fetchGame();
      return;
    }
    setGame((g) => {
      if (!g || !g.lastTossupWinner) return g;
      const next = { ...g, history: [...(g.history || [])] };
      if (g.lastTossupWinner === "A") {
        next.teamAScore = (next.teamAScore || 0) + 10;
        next.history.push({
          type: "BONUS",
          description: `Bonus +10 → ${next.teamAName || "Team A"}`,
          timestamp: Date.now(),
          team: "A",
          points: 10,
        });
      } else if (g.lastTossupWinner === "B") {
        next.teamBScore = (next.teamBScore || 0) + 10;
        next.history.push({
          type: "BONUS",
          description: `Bonus +10 → ${next.teamBName || "Team B"}`,
          timestamp: Date.now(),
          team: "B",
          points: 10,
        });
      }
      return next;
    });
    if (bonusRef.current) {
      bonusRef.current.currentTime = 0;
      bonusRef.current.play();
    }
  };

  const handleNextTossup = async () => {
    if (!isAdmin) {
      setGame((g) =>
        g
          ? { ...g, questionNumber: (g.questionNumber || 1) + 1, lastTossupWinner: null }
          : g
      );
      setTimerMode("tossup");
      setTimerSeconds(7);
      setTimerRunning(false);
      return;
    }
    await api.post("/api/game/next-tossup", null, { params: { gameId }, headers: adminHeaders() });
    setTimerMode("tossup");
    setTimerSeconds(7);
    setTimerRunning(false);
    fetchGame();
  };

  const handleResetGame = async () => {
    try {
      if (!isAdmin) {
        setGame({
          teamAName: "Team A",
          teamBName: "Team B",
          teamAScore: 0,
          teamBScore: 0,
          questionNumber: 1,
          lastTossupWinner: null,
          history: [],
        });
        setTimerMode("tossup");
        setTimerSeconds(7);
        setTimerRunning(false);
        setAuthError("");
        return;
      }
      await api.post("/api/game/reset", null, { params: { gameId }, headers: adminHeaders() });
      await api.post("/api/bracket/reset", null, { headers: adminHeaders() });
      setTimerMode("tossup");
      setTimerSeconds(7);
      setTimerRunning(false);
      setPairTeamAId("");
      setPairTeamBId("");
      setPlayerTeamId("");
      setBracketNamesText("");
      setAuthError("");
      fetchGame();
      fetchBracket();
    } catch (err) {
      const message = err?.response?.data?.message || "Unable to reset game (are you logged in as admin?)";
      setAuthError(message);
    }
  };

  const handleSaveNames = async () => {
    if (!isAdmin) {
      // local-only change for viewers
      setGame((g) => ({
        ...(g || {}),
        teamAName: teamAInput,
        teamBName: teamBInput,
      }));
      setEditingNames(false);
      return;
    }
    await api.post("/api/game/team-names", {
      teamAName: teamAInput,
      teamBName: teamBInput,
    }, { params: { gameId }, headers: adminHeaders() });
    setEditingNames(false);
    fetchGame();
  };

  const initBracket = async () => {
    const names = bracketNamesText
      .split("\n")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    await api.post("/api/bracket/init", { teamNames: names }, { headers: adminHeaders() });
    fetchBracket();
  };

  const resetBracket = async () => {
    await api.post("/api/bracket/reset", null, { headers: adminHeaders() });
    setPairTeamAId("");
    setPairTeamBId("");
    fetchBracket();
  };

  const pushPairingToGame = async () => {
    if (!pairTeamAId || !pairTeamBId) return;
    await api.post(
      "/api/bracket/set-current",
      {
        teamAId: pairTeamAId,
        teamBId: pairTeamBId,
      },
      { params: { gameId }, headers: adminHeaders() }
    );
    await fetchBracket();
    await fetchGame();
  };

  const finalizeCurrentMatch = async () => {
    await api.post("/api/bracket/finalize-current", null, { params: { gameId }, headers: adminHeaders() });
    await fetchBracket();
  };

  const getTeamName = useCallback(
    (id) => {
      if (!bracket || !bracket.teams) return "";
      const team = bracket.teams.find((t) => t.id === id);
      return team ? team.name : "";
    },
    [bracket]
  );

  const history = useMemo(() => {
    const items = game?.history || [];
    return [...items].reverse();
  }, [game]);

  const renderTree = (bracketName) => {
    if (!bracket) return null;
    const matches = (bracket.matches || []).filter((m) => m.bracket === bracketName);
    const byRound = {};
    matches.forEach((m) => {
      if (!byRound[m.round]) byRound[m.round] = [];
      byRound[m.round].push(m);
    });
    const rounds = Object.keys(byRound)
      .map((n) => parseInt(n, 10))
      .sort((a, b) => a - b);

    return (
      <div className="bracket-tree">
        {rounds.map((round) => (
          <div className="bracket-col" key={`${bracketName}-${round}`}>
            <div className="bracket-col-title">Round {round}</div>
            {byRound[round].map((m) => (
              <div className="match-card" key={m.id}>
                <div className="match-row">
                  <span>{getTeamName(m.teamAId)}</span>
                  <span className="score-pill">
                    {m.scoreA !== null && m.scoreA !== undefined ? m.scoreA : "-"}
                  </span>
                </div>
                <div className="match-row">
                  <span>{getTeamName(m.teamBId)}</span>
                  <span className="score-pill">
                    {m.scoreB !== null && m.scoreB !== undefined ? m.scoreB : "-"}
                  </span>
                </div>
                {m.winnerId && (
                  <div className="winner-line">
                    Winner: <strong>{getTeamName(m.winnerId)}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const winnersList = (bracket?.teams || []).filter(
    (t) => !t.eliminated && t.losses === 0
  );
  const losersList = (bracket?.teams || []).filter(
    (t) => !t.eliminated && t.losses === 1
  );
  const eliminatedList = (bracket?.teams || []).filter((t) => t.eliminated);

  const timerTotal = timerMode === "bonus" ? 20 : 7;
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const progress = timerProgress();
  const offset = circumference * (1 - progress);
  const stroke =
    progress > 0.5 ? "#4ade80" : progress > 0.25 ? "#fbbf24" : "#fb923c";

  const handleLogin = async () => {
    try {
      const res = await api.post("/api/auth/login", {
        username: loginUsername,
        password: loginPassword,
      });
      setAuthToken(res.data.token);
      setAuthRole(res.data.role);
      setAuthUsername(res.data.username);
      localStorage.setItem("authToken", res.data.token);
      localStorage.setItem("authRole", res.data.role);
      localStorage.setItem("authUsername", res.data.username);
      setAuthError("");
    } catch (err) {
      const message = err?.response?.data?.message || "Invalid username or password";
      setAuthError(message);
    }
  };

  const handleRegister = async () => {
    try {
      const res = await api.post("/api/auth/register", {
        username: registerUsername,
        password: registerPassword,
      });
      setAuthToken(res.data.token);
      setAuthRole(res.data.role);
      setAuthUsername(res.data.username);
      localStorage.setItem("authToken", res.data.token);
      localStorage.setItem("authRole", res.data.role);
      localStorage.setItem("authUsername", res.data.username);
      setAuthView("login");
      setAuthError("");
    } catch (err) {
      const message = err?.response?.data?.message || "Registration failed";
      setAuthError(message);
    }
  };

  const handleProfileUpdate = async (newUsername, newPassword) => {
    try {
      const res = await api.post(
        "/api/auth/update-profile",
        { newUsername, newPassword },
        { headers: adminHeaders() }
      );
      setAuthUsername(res.data.username);
      setAuthRole(res.data.role);
      localStorage.setItem("authUsername", res.data.username);
      localStorage.setItem("authRole", res.data.role);
      setAuthError("Profile updated");
    } catch (err) {
      const message = err?.response?.data?.message || "Update failed";
      setAuthError(message);
    }
  };

  const handleLogout = () => {
    setAuthToken("");
    setAuthRole("");
    setAuthUsername("");
    localStorage.removeItem("authToken");
    localStorage.removeItem("authRole");
    localStorage.removeItem("authUsername");
  };

  const nextMatchForTeam = (teamId) => {
    if (!bracket || !teamId) return null;
    const pending = (bracket.matches || []).find(
      (m) => !m.completed && (m.teamAId === teamId || m.teamBId === teamId)
    );
    if (pending) {
      return {
        bracket: pending.bracket,
        round: pending.round,
        opponent:
          pending.teamAId === teamId ? getTeamName(pending.teamBId) : getTeamName(pending.teamAId),
      };
    }
    const suggestedWin = (bracket.suggestedWinnersPairs || []).find(
      (p) => p.teamAId === teamId || p.teamBId === teamId
    );
    if (suggestedWin) {
      const opponent =
        suggestedWin.teamAId === teamId
          ? getTeamName(suggestedWin.teamBId)
          : getTeamName(suggestedWin.teamAId);
      return { bracket: "WINNERS", round: "TBD", opponent, status: "Awaiting winners pairing" };
    }
    const suggestedLose = (bracket.suggestedLosersPairs || []).find(
      (p) => p.teamAId === teamId || p.teamBId === teamId
    );
    if (suggestedLose) {
      const opponent =
        suggestedLose.teamAId === teamId
          ? getTeamName(suggestedLose.teamBId)
          : getTeamName(suggestedLose.teamAId);
      return { bracket: "LOSERS", round: "TBD", opponent, status: "Awaiting losers pairing" };
    }
    const team = (bracket.teams || []).find((t) => t.id === teamId);
    if (team?.eliminated) {
      return { status: "Eliminated" };
    }
    if (bracket.finished) {
      return { status: "Bracket finished" };
    }
    return { status: "Waiting for scheduling" };
  };

  const viewerNextMatch = nextMatchForTeam(playerTeamId);

  if (!authToken) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-toggle">
            <button
              className={`tab ${authView === "login" ? "active" : ""}`}
              onClick={() => setAuthView("login")}
            >
              Login
            </button>
            <button
              className={`tab ${authView === "register" ? "active" : ""}`}
              onClick={() => setAuthView("register")}
            >
              Register
            </button>
          </div>
          {authView === "login" ? (
            <>
              <h2>Welcome back</h2>
              <p className="muted">Admins sign in; players use their own account.</p>
              <input
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="Username"
              />
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Password"
              />
              <button className="btn primary" onClick={handleLogin}>
                Sign in
              </button>
            </>
          ) : authView === "register" ? (
            <>
              <h2>Create your account</h2>
              <input
                value={registerUsername}
                onChange={(e) => setRegisterUsername(e.target.value)}
                placeholder="Choose username"
              />
              <input
                type="password"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                placeholder="Choose password"
              />
              <button className="btn primary" onClick={handleRegister}>
                Register &amp; continue
              </button>
            </>
          ) : null}
          {authError && <div className="auth-error">{authError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">Quizbowl Control</div>
        <div className="header-actions">
          <div className="auth-chip">
            <div className="auth-name">{authUsername || "user"}</div>
            <div className="auth-role">({isAdmin ? "Administrator" : "Viewer"})</div>
            <button
              className="btn ghost small-btn"
              onClick={() => handleProfileUpdate(prompt("New username (leave blank to keep)", ""), prompt("New password (leave blank to keep)", ""))}
            >
              Update profile
            </button>
            <button className="btn ghost" onClick={handleLogout}>
              Logout
            </button>
          </div>
          <div className="tabs">
            <button
              className={`tab ${page === "control" ? "active" : ""}`}
              onClick={() => setPage("control")}
            >
              Control
            </button>
            <button
              className={`tab ${page === "bracket" ? "active" : ""}`}
              onClick={() => setPage("bracket")}
            >
              Bracket
            </button>
          </div>
        </div>
      </header>

      {page === "control" && (
        <>
          <div className="control-layout">
            <div className="card timer-card">
              <div className="card-header">
                <h3>Timer &amp; Flow</h3>
                <div className="chip-row">
                  <button
                    className={`chip ${timerMode === "tossup" ? "active" : ""}`}
                    onClick={() => {
                      setTimerMode("tossup");
                      setTimerSeconds(7);
                      setTimerRunning(false);
                    }}
                  >
                    Tossup (7s)
                  </button>
                  <button
                    className={`chip ${timerMode === "bonus" ? "active" : ""}`}
                    onClick={() => {
                      setTimerMode("bonus");
                      setTimerSeconds(20);
                      setTimerRunning(false);
                    }}
                  >
                    Bonus (20s)
                  </button>
                </div>
              </div>
              <div className="timer-body">
                <div className="timer-visual">
                  <div className="timer-ring">
                    <svg height="180" width="180">
                      <circle
                        cx="90"
                        cy="90"
                        r={radius}
                        stroke="#1f2a44"
                        strokeWidth="10"
                        fill="none"
                        className="timer-track"
                      />
                      <circle
                        cx="90"
                        cy="90"
                        r={radius}
                        stroke={stroke}
                        strokeWidth="10"
                        fill="none"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        transform="rotate(-90 90 90)"
                        strokeLinecap="round"
                        className="timer-progress"
                      />
                    </svg>
                    <div className="timer-center">
                      <div className="timer-value">{timerSeconds}s</div>
                      <div className="timer-mode-label">
                        {timerMode === "bonus" ? "Bonus" : "Tossup"} timer
                      </div>
                    </div>
                  </div>
                  <div className="timer-actions">
                    <button
                      className="btn primary"
                      onClick={() => startTimerWithMode(timerMode)}
                    >
                      Start
                    </button>
                    <button className="btn ghost" onClick={pauseTimer}>
                      Pause
                    </button>
                    <button className="btn ghost" onClick={resetTimer}>
                      Reset
                    </button>
                  </div>
                </div>
                <div className="timer-side">
                  <p className="muted">Use Tossup/Bonus chips to load durations.</p>
                  <p className="muted">
                    Start resets to the full length for the selected mode. Pause halts countdown.
                  </p>
                  <p className="muted">Next Tossup will also clear the timer back to 7 seconds.</p>
                </div>
              </div>
            </div>

            <div className="card scoreboard-card">
              <div className="scoreboard">
                <div className="team-block">
                  <div className="team-heading">
                    <span className="dot dot-a" />
                    {editingNames ? (
                      <input
                        value={teamAInput}
                        onChange={(e) => setTeamAInput(e.target.value)}
                      />
                    ) : (
                      <span className="team-name">{game?.teamAName || "Team A"}</span>
                    )}
                  </div>
                  <div className="team-score">{game?.teamAScore ?? 0}</div>
                </div>

                <div className="center-block">
                  <div className="question-label">Question</div>
                  <div className="question-number">#{game?.questionNumber ?? 1}</div>
                  <div className="center-actions">
                    <button className="btn primary" onClick={handleNextTossup}>
                      Next tossup
                    </button>
                    <button className="btn ghost" onClick={handleResetGame}>
                      Reset game
                    </button>
                  </div>
                  <div className="edit-row">
                    <button
                      className={`chip small ${editingNames ? "active" : ""}`}
                      onClick={() => setEditingNames((v) => !v)}
                    >
                      {editingNames ? "Editing…" : "Edit names"}
                    </button>
                    {editingNames && (
                      <button className="btn primary" onClick={handleSaveNames}>
                        Save names
                      </button>
                    )}
                  </div>
                </div>

                <div className="team-block">
                  <div className="team-heading">
                    <span className="dot dot-b" />
                    {editingNames ? (
                      <input
                        value={teamBInput}
                        onChange={(e) => setTeamBInput(e.target.value)}
                      />
                    ) : (
                      <span className="team-name">{game?.teamBName || "Team B"}</span>
                    )}
                  </div>
                  <div className="team-score">{game?.teamBScore ?? 0}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="control-bottom-row">
            <div className="card scoring-card">
              <div className="section-header">
                <h3>Scoring</h3>
                <span className="muted">Live actions feed the history log.</span>
              </div>
              <div className="scoring-section">
                <div className="section-label">Tossups</div>
                <div className="action-row">
                  <button className="btn primary wide" onClick={() => awardTossup("A")}>
                    Tossup +10 → {game?.teamAName || "Team A"}
                  </button>
                  <button className="btn primary wide" onClick={() => awardTossup("B")}>
                    Tossup +10 → {game?.teamBName || "Team B"}
                  </button>
                </div>
              </div>
              <div className="scoring-section">
                <div className="section-label">Bonus</div>
                <div className="action-row">
                  <button
                    className="btn bonus wide"
                    disabled={!game?.lastTossupWinner || !isAdmin}
                    onClick={awardBonus}
                  >
                    {game?.lastTossupWinner === "A"
                      ? `Bonus +10 → ${game?.teamAName || "Team A"}`
                      : game?.lastTossupWinner === "B"
                      ? `Bonus +10 → ${game?.teamBName || "Team B"}`
                      : "Bonus +10 (await tossup)"}
                  </button>
                </div>
                <div className="muted small-text">
                  Bonus always goes to whoever got the last tossup. If no tossup, no bonus.
                </div>
              </div>
            </div>

            <div className="card history-card">
              <div className="section-header">
                <h3>Recent history</h3>
                {loadingGame && <span className="muted">Syncing…</span>}
              </div>
              <div className="history-list">
                {history.map((ev, idx) => (
                  <div className="history-item" key={`${ev.timestamp}-${idx}`}>
                    <div className="history-type">{ev.type}</div>
                    <div className="history-desc">{ev.description}</div>
                    <div className="history-time">
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
                {history.length === 0 && <div className="muted">No events yet.</div>}
              </div>
            </div>
          </div>
        </>
      )}

      {page === "bracket" && (
        <div className="bracket-layout">
          {isAdmin && (!bracket?.teams || bracket?.teams.length === 0) && (
            <div className="card setup-card">
              <div className="card-header">
                <h3>Bracket setup &amp; pairing</h3>
                {loadingBracket && <span className="muted">Loading…</span>}
              </div>
              <textarea
                className="bracket-textarea"
                placeholder="Enter one team per line"
                value={bracketNamesText}
                onChange={(e) => setBracketNamesText(e.target.value)}
              />
              <div className="button-row">
                <button className="btn primary" onClick={initBracket} disabled={!isAdmin}>
                  Initialize bracket
                </button>
                <button className="btn ghost" onClick={resetBracket} disabled={!isAdmin}>
                  Reset bracket
                </button>
              </div>

              <div className="pair-row">
                <div className="pair">
                  <label>Left scoreboard</label>
                  <select value={pairTeamAId} onChange={(e) => setPairTeamAId(e.target.value)}>
                    <option value="">Select team</option>
                    {(bracket?.teams || [])
                      .filter((t) => !t.eliminated)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="pair">
                  <label>Right scoreboard</label>
                  <select value={pairTeamBId} onChange={(e) => setPairTeamBId(e.target.value)}>
                    <option value="">Select team</option>
                    {(bracket?.teams || [])
                      .filter((t) => !t.eliminated)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="button-row">
                <button className="btn primary" onClick={pushPairingToGame} disabled={!isAdmin}>
                  Push pairing to game
                </button>
                <button className="btn ghost" onClick={finalizeCurrentMatch} disabled={!isAdmin}>
                  Finalize current match
                </button>
              </div>

              <div className="status-row">
                <div className="status-chip winners">
                  Winners:{" "}
                  {winnersList.length
                    ? winnersList.map((t) => t.name).join(", ")
                    : "—"}
                </div>
                <div className="status-chip losers">
                  Losers:{" "}
                  {losersList.length ? losersList.map((t) => t.name).join(", ") : "—"}
                </div>
                <div className="status-chip eliminated">
                  Eliminated:{" "}
                  {eliminatedList.length
                    ? eliminatedList.map((t) => t.name).join(", ")
                    : "—"}
                </div>
              </div>

              <div className="suggestions-row">
                {bracket?.suggestedWinnersTeamAId && bracket?.suggestedWinnersTeamBId && (
                  <div className="suggestion-pill">
                    Next winners match:{" "}
                    <strong>
                      {getTeamName(bracket.suggestedWinnersTeamAId)} vs{" "}
                      {getTeamName(bracket.suggestedWinnersTeamBId)}
                    </strong>
                  </div>
                )}
                {bracket?.suggestedLosersTeamAId && bracket?.suggestedLosersTeamBId && (
                  <div className="suggestion-pill">
                    Next losers match:{" "}
                    <strong>
                      {getTeamName(bracket.suggestedLosersTeamAId)} vs{" "}
                      {getTeamName(bracket.suggestedLosersTeamBId)}
                    </strong>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="card bracket-card">
            {isAdmin && (bracket?.teams || []).length > 0 && (
              <div className="inline-controls">
                <div className="pair">
                  <label>Left scoreboard</label>
                  <select value={pairTeamAId} onChange={(e) => setPairTeamAId(e.target.value)}>
                    <option value="">Select team</option>
                    {(bracket?.teams || [])
                      .filter((t) => !t.eliminated)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="pair">
                  <label>Right scoreboard</label>
                  <select value={pairTeamBId} onChange={(e) => setPairTeamBId(e.target.value)}>
                    <option value="">Select team</option>
                    {(bracket?.teams || [])
                      .filter((t) => !t.eliminated)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>
                <button className="btn primary" onClick={pushPairingToGame} disabled={!isAdmin}>
                  Push to game
                </button>
                <button className="btn ghost" onClick={finalizeCurrentMatch} disabled={!isAdmin}>
                  Finalize current
                </button>
              </div>
            )}
            <div className="trees-top-row">
              <div>
                <div className="tree-header">
                  <h4>Winners bracket</h4>
                  <div className="header-line">
                    {winnersList.map((t) => t.name).join(" • ")}
                  </div>
                  {bracket?.suggestedWinnersPairs && bracket.suggestedWinnersPairs.length > 0 && (
                    <div className="suggest-list">
                      {bracket.suggestedWinnersPairs.map((p, idx) => (
                        <div className="suggestion-pill" key={`w-${p.teamAId}-${p.teamBId}-${idx}`}>
                          {getTeamName(p.teamAId)} vs {getTeamName(p.teamBId)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {renderTree("WINNERS")}
              </div>
              <div>
                <div className="tree-header">
                  <h4>Losers bracket</h4>
                  <div className="header-line">
                    {losersList.map((t) => t.name).join(" • ")}
                  </div>
                  {bracket?.suggestedLosersPairs && bracket.suggestedLosersPairs.length > 0 && (
                    <div className="suggest-list">
                      {bracket.suggestedLosersPairs.map((p, idx) => (
                        <div className="suggestion-pill" key={`l-${p.teamAId}-${p.teamBId}-${idx}`}>
                          {getTeamName(p.teamAId)} vs {getTeamName(p.teamBId)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {renderTree("LOSERS")}
              </div>
            </div>

            <div className="standings">
              <h4>Standings</h4>
              <table>
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Losses</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(bracket?.teams || [])
                    .slice()
                    .sort((a, b) => a.losses - b.losses)
                    .map((team) => (
                      <tr key={team.id}>
                        <td>{team.name}</td>
                        <td>{team.losses}</td>
                        <td>
                          {team.eliminated
                            ? "Eliminated"
                            : team.losses === 0
                            ? "Winners bracket"
                            : "Losers bracket"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="viewer-card card">
            <h4>Player lookup</h4>
            <select value={playerTeamId} onChange={(e) => setPlayerTeamId(e.target.value)}>
              <option value="">Select your team</option>
              {(bracket?.teams || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {viewerNextMatch ? (
              <div className="viewer-info">
                {viewerNextMatch.status ? (
                  <div className="muted">{viewerNextMatch.status}</div>
                ) : (
                  <div>
                    Next match: {viewerNextMatch.bracket} Round {viewerNextMatch.round} vs{" "}
                    {viewerNextMatch.opponent || "TBD"}
                  </div>
                )}
              </div>
            ) : (
              <div className="muted">No pending matches found yet.</div>
            )}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="footer-bar">
          <button className="btn ghost" onClick={handleResetGame}>
            Reset game
          </button>
        </div>
      )}

      <audio ref={correctRef} src="/sounds/correct.wav" />
      <audio ref={bonusRef} src="/sounds/bonus.wav" />
      <audio ref={timerEndRef} src="/sounds/timer_end.wav" />
    </div>
  );
}

export default App;
