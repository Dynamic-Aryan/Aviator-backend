const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// ✅ **Fix CORS Issues**
const corsOptions = {
    origin: ["http://localhost:5173", "https://aviator-frontend-mocha.vercel.app"], // Update with your frontend URL
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true // Allow cookies and authentication headers
};

app.use(cors(corsOptions));
app.use(express.json());

// ✅ **Configure Socket.io with CORS**
const io = socketIo(server, {
    cors: corsOptions,
    transports: ["websocket", "polling"]
});

let gameRunning = false;
let bettingPhase = false;
let multiplier = 1.0;
let crashPoint = 0;
let bets = {};
let balances = { User1: 1000, User2: 1000 };
let houseBalance = 100000;
let countdown = 5;

// ✅ **Dynamic Crash Point Calculation**
const calculateCrashPoint = () => {
    const totalBets = Object.values(bets).reduce((sum, bet) => sum + bet.amount, 0);
    const totalPlayers = Object.keys(bets).length;
    const playersCashedOut = Object.values(bets).filter(bet => bet.cashedOut).length;
    const cashoutPercentage = playersCashedOut / (totalPlayers || 1);

    let maxPossibleMultiplier;

    if (houseBalance < 80000) {
        console.log("⚠️ House is recovering losses...");
        return Math.random() < 0.5 ? 1.1 : (Math.random() * (2.5 - 1.3) + 1.3).toFixed(2);
    }

    if (totalPlayers === 0) {
        console.log("🎭 No players bet, setting high crash.");
        return (Math.random() * (15 - 8) + 8).toFixed(2);
    }

    if (cashoutPercentage > 0.7) {
        maxPossibleMultiplier = Math.random() < 0.5 ? 4.5 : 5.5;
    } else if (cashoutPercentage > 0.4) {
        maxPossibleMultiplier = Math.random() < 0.5 ? 2.5 : 3.5;
    } else {
        maxPossibleMultiplier = Math.random() < 0.6 ? 1.5 : 2.0;
    }

    return (Math.random() * (maxPossibleMultiplier - 1.2) + 1.2).toFixed(2);
};

// ✅ **Betting Phase Countdown**
const startBettingPhase = () => {
    bettingPhase = true;
    bets = {};
    countdown = 5;

    const timer = setInterval(() => {
        countdown--;
        io.emit("bettingCountdown", { countdown });

        if (countdown === 0) {
            clearInterval(timer);
            bettingPhase = false;
            startGame();
        }
    }, 1000);

    io.emit("bettingStart", { message: "Betting phase started!", countdown });
};

// ✅ **Start Game**
const startGame = () => {
    if (gameRunning) return;

    gameRunning = true;
    multiplier = 1.0;
    crashPoint = calculateCrashPoint();

    console.log(`🚀 New round started! Crash at ${crashPoint}x`);

    let interval = setInterval(() => {
        multiplier = (parseFloat(multiplier) + 0.02).toFixed(2);
        io.emit("multiplierUpdate", { multiplier });

        if (parseFloat(multiplier) >= parseFloat(crashPoint)) {
            clearInterval(interval);
            endGame();
        }
    }, 80);
};

// ✅ **End Game**
const endGame = () => {
    console.log(`🔥 Game crashed at ${crashPoint}x`);
    io.emit("gameCrash", { crashPoint, houseBalance });

    Object.keys(bets).forEach((playerId) => {
        if (!bets[playerId].cashedOut) {
            houseBalance += bets[playerId].amount;
        }
    });

    gameRunning = false;
    io.emit("updateHouseBalance", { houseBalance });

    setTimeout(startBettingPhase, 3000);
};

// ✅ **Place Bet**
app.post("/bet", (req, res) => {
    const { playerId, amount } = req.body;

    if (!bettingPhase) {
        return res.status(400).json({ message: "Betting is closed!" });
    }

    if (!balances[playerId] || balances[playerId] < amount) {
        return res.status(400).json({ message: "Not enough balance!" });
    }

    balances[playerId] -= amount;
    bets[playerId] = { amount, cashedOut: false };

    res.json({ message: "Bet placed", playerId, amount, newBalance: balances[playerId] });
});

// ✅ **Cashout**
app.post("/cashout", (req, res) => {
    const { playerId } = req.body;

    if (!bets[playerId] || bets[playerId].cashedOut) {
        return res.status(400).json({ message: "No active bet or already cashed out!" });
    }

    bets[playerId].cashedOut = true;
    const winnings = bets[playerId].amount * parseFloat(multiplier);

    balances[playerId] += winnings;
    houseBalance -= winnings;

    io.emit("playerCashout", { playerId, multiplier, winnings, newBalance: balances[playerId], houseBalance });

    res.json({ message: "Cashed out successfully", winnings, newBalance: balances[playerId] });
});

// ✅ **Handle WebSocket Connection**
io.on("connection", (socket) => {
    console.log("⚡ New client connected:", socket.id);

    socket.on("disconnect", () => {
        console.log("⚠️ Client disconnected:", socket.id);
    });
});

// ✅ **Start First Betting Phase**
setTimeout(startBettingPhase, 3000);

app.get("/", (req, res) => {
    res.send("Server is running!");
});

// ✅ **Start Server**
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));
