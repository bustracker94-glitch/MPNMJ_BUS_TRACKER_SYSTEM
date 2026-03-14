import { useState } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';
import axios from 'axios';

export default function ChatbotButton() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { text: "Hi! I'm the MPNMJ Bus Assistant. How can I help you today?", isBot: true }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setMessages(prev => [...prev, { text: userMsg, isBot: false }]);
        setInput('');
        setIsLoading(true);

        try {
            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
            const response = await axios.post(`${backendUrl}/api/bot/chat`, {
                message: userMsg,
                history: messages
            });

            if (response.data && response.data.reply) {
                setMessages(prev => [...prev, { text: response.data.reply, isBot: true }]);
            } else {
                setMessages(prev => [...prev, { text: "No valid response from server.", isBot: true }]);
            }
        } catch (error) {
            console.error("Chatbot API Error:", error);
            const errMsg = error.response?.data?.error || "Sorry, I am facing technical difficulties connecting to the network right now.";
            setMessages(prev => [...prev, { text: errMsg, isBot: true }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* Floating Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 p-4 rounded-full primary-gradient text-white shadow-[0_10px_25px_-5px_rgba(255,160,0,0.5)] hover:scale-105 active:scale-95 transition-all z-50 flex items-center justify-center border-[3px] border-white"
                style={{ display: isOpen ? 'none' : 'flex' }}
            >
                <MessageSquare size={28} />
            </button>

            {/* Chat Window */}
            {isOpen && (
                <div className="fixed bottom-6 right-6 w-[350px] h-[500px] bg-white rounded-3xl shadow-2xl z-50 flex flex-col overflow-hidden border border-gray-100 animate-in slide-in-from-bottom-5 fade-in duration-300">
                    {/* Header */}
                    <div className="p-4 primary-gradient flex justify-between items-center text-white">
                        <div className="flex items-center gap-2">
                            <div className="bg-white/20 p-2 rounded-full">
                                <MessageSquare size={18} fill="currentColor" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm">Bus Assistant</h3>
                                <p className="text-[10px] text-yellow-100 font-medium">Online</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 flex flex-col">
                        {messages.map((msg, i) => (
                            <div key={i} className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${msg.isBot ? 'bg-white rounded-tl-none border border-gray-100 text-gray-800 self-start' : 'primary-gradient text-white rounded-tr-none self-end'}`}>
                                {msg.text}
                            </div>
                        ))}
                        {isLoading && (
                            <div className="max-w-[85%] p-3 rounded-2xl text-sm shadow-sm bg-white rounded-tl-none border border-gray-100 text-gray-500 self-start animate-pulse flex gap-1 items-center">
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <form onSubmit={handleSend} className="p-4 bg-white border-t border-gray-100 flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="Ask me anything..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            disabled={isLoading}
                            className={`flex-1 bg-gray-100 border-none rounded-full px-4 py-2.5 text-sm focus:ring-2 focus:ring-yellow-500 font-medium outline-none ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                        />
                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`p-2.5 primary-gradient text-white rounded-full transition-opacity flex-shrink-0 ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
                        >
                            <Send size={18} />
                        </button>
                    </form>
                </div>
            )}
        </>
    );
}
