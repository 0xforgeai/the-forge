import { useState, useRef, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { base } from 'wagmi/chains';
import { parseEther } from 'viem';
import { apiFetch } from '../hooks/useApi';
import {
    FORGE_TOKEN_ADDRESS, FORGE_TOKEN_ABI,
    ARENA_VAULT_ADDRESS, ARENA_VAULT_ABI,
    FORGE_ARENA_ADDRESS, FORGE_ARENA_ABI,
} from '../config/contracts';

const CONTRACT_MAP = {
    FORGE_TOKEN: { address: FORGE_TOKEN_ADDRESS, abi: FORGE_TOKEN_ABI },
    ARENA_VAULT: { address: ARENA_VAULT_ADDRESS, abi: ARENA_VAULT_ABI },
    FORGE_ARENA: { address: FORGE_ARENA_ADDRESS, abi: FORGE_ARENA_ABI },
};

export default function ForgeChat() {
    const { authenticated } = usePrivy();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'assistant', text: 'Welcome to The Forge. Ask me anything — stake, bet, check your position, or enter a bout.' },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [pendingTx, setPendingTx] = useState(null);
    const [txStep, setTxStep] = useState(0);
    const scrollRef = useRef(null);

    const { writeContractAsync } = useWriteContract();

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    async function handleSend() {
        if (!input.trim() || loading) return;
        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setLoading(true);

        try {
            const result = await apiFetch('/api/bankr/command', {
                method: 'POST',
                body: JSON.stringify({ message: userMsg }),
            });

            if (result.type === 'write' && result.txSteps) {
                setMessages(prev => [...prev, { role: 'assistant', text: result.message }]);
                setPendingTx(result);
                setTxStep(0);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', text: result.message || 'Done.' }]);
            }
        } catch (err) {
            setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${err.message || 'Failed to process command'}`, isError: true }]);
        }

        setLoading(false);
    }

    async function executeTxSteps() {
        if (!pendingTx?.txSteps) return;
        setLoading(true);

        for (let i = txStep; i < pendingTx.txSteps.length; i++) {
            const step = pendingTx.txSteps[i];
            const contractInfo = CONTRACT_MAP[step.contract];
            if (!contractInfo) {
                setMessages(prev => [...prev, { role: 'assistant', text: `Unknown contract: ${step.contract}`, isError: true }]);
                break;
            }

            setMessages(prev => [...prev, { role: 'assistant', text: `⏳ ${step.label}...` }]);

            try {
                const hash = await writeContractAsync({
                    address: contractInfo.address,
                    abi: contractInfo.abi,
                    functionName: step.method,
                    args: step.args.map(arg => {
                        // Convert string numbers that look like wei values to BigInt
                        if (typeof arg === 'string' && /^\d+$/.test(arg) && arg.length > 10) {
                            return BigInt(arg);
                        }
                        return arg;
                    }),
                    chainId: base.id,
                });

                setMessages(prev => [...prev, { role: 'assistant', text: `✓ ${step.label} — tx: ${hash.slice(0, 10)}...` }]);
                setTxStep(i + 1);
            } catch (err) {
                const msg = err.shortMessage || err.message || 'Transaction failed';
                setMessages(prev => [...prev, { role: 'assistant', text: `✗ ${msg}`, isError: true }]);
                break;
            }
        }

        setPendingTx(null);
        setTxStep(0);
        setLoading(false);
    }

    if (!authenticated) return null;

    return (
        <>
            {/* Toggle Button */}
            <button
                className="forge-chat-toggle"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Toggle Forge Chat"
            >
                {isOpen ? '✕' : '⚡'}
            </button>

            {/* Chat Panel */}
            {isOpen && (
                <div className="forge-chat-panel">
                    <div className="forge-chat-header">
                        <span className="forge-chat-title">
                            <img src="/icons/zap-fast.svg" className="icon icon-sm" /> FORGE COMMAND
                        </span>
                        <span className="dim" style={{ fontSize: '0.625rem' }}>Powered by Bankr Router</span>
                    </div>

                    <div className="forge-chat-messages" ref={scrollRef}>
                        {messages.map((msg, i) => (
                            <div key={i} className={`forge-chat-msg ${msg.role} ${msg.isError ? 'error' : ''}`}>
                                {msg.text}
                            </div>
                        ))}
                        {loading && (
                            <div className="forge-chat-msg assistant">
                                <span className="forge-chat-typing">Thinking...</span>
                            </div>
                        )}
                    </div>

                    {pendingTx && (
                        <div className="forge-chat-confirm">
                            <button className="btn btn-green btn-full" onClick={executeTxSteps} disabled={loading}>
                                {loading ? 'Executing...' : `Confirm — ${pendingTx.txSteps.length} step(s)`}
                            </button>
                        </div>
                    )}

                    <div className="forge-chat-input">
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                            placeholder="stake 5000 in Obsidian..."
                            disabled={loading}
                        />
                        <button onClick={handleSend} disabled={loading || !input.trim()} className="forge-chat-send">→</button>
                    </div>
                </div>
            )}
        </>
    );
}
