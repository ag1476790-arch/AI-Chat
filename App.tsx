
import React, { useState, useRef, useEffect, useCallback } from 'react';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import { Message, ChatState } from './types';
import { streamChatResponse } from './services/geminiService';

const App: React.FC = () => {
  const [state, setState] = useState<ChatState>({
    messages: [
      {
        id: 'welcome',
        role: 'assistant',
        content: "Hello! I'm Gemini Chatbot Pro. How can I help you today?",
        timestamp: new Date(),
      }
    ],
    isLoading: false,
    error: null,
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [state.messages, scrollToBottom]);

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    const assistantPlaceholder: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage, assistantPlaceholder],
      isLoading: true,
      error: null,
    }));

    try {
      let fullAssistantContent = '';
      
      await streamChatResponse(
        [...state.messages, userMessage],
        (chunk) => {
          fullAssistantContent += chunk;
          setState(prev => {
            const newMessages = [...prev.messages];
            const lastIndex = newMessages.length - 1;
            if (newMessages[lastIndex].id === assistantPlaceholder.id) {
              newMessages[lastIndex] = {
                ...newMessages[lastIndex],
                content: fullAssistantContent,
              };
            }
            return { ...prev, messages: newMessages };
          });
        }
      );

      setState(prev => ({ ...prev, isLoading: false }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: "Sorry, something went wrong while processing your request. Please try again.",
        // Remove the empty assistant message on error
        messages: prev.messages.filter(m => m.id !== assistantPlaceholder.id)
      }));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shadow-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <i className="fas fa-bolt text-white"></i>
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">Gemini Pro</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Online</span>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setState(prev => ({ ...prev, messages: [prev.messages[0]], error: null }))}
            className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-800"
            title="Clear Chat"
          >
            <i className="fas fa-trash-alt"></i>
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <main 
        ref={scrollRef}
        className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6"
      >
        <div className="max-w-4xl mx-auto w-full">
          {state.messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          
          {state.error && (
            <div className="flex justify-center my-4">
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                <i className="fas fa-exclamation-circle"></i>
                {state.error}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Input Area */}
      <ChatInput onSendMessage={handleSendMessage} disabled={state.isLoading} />
    </div>
  );
};

export default App;
