"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const env_1 = require("./config/env");
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Routes Placeholder
app.get('/', (req, res) => {
    res.send('🌿 EUM v2.0 Backend is Running');
});
// Start Server
app.listen(env_1.config.port, () => {
    console.log(`🚀 Server running on http://localhost:${env_1.config.port}`);
});
//# sourceMappingURL=index.js.map