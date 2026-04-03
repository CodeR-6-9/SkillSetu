import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Mic,
  Square,
  Loader2,
  User,
  Bot,
  Trash2,
  Send,
  ChevronLeft,
  Flag,
} from "lucide-react";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { sendAudioToAI, getInterviewSummary, updateUserProfile } from "../api/aiService"; 
import { useAuth, useUser } from "@clerk/clerk-react";

export default function AIInterview() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId } = useAuth();
  const { user } = useUser();

  const selectedSkill = location.state?.skill || "General Trade";
  const selectedLang = location.state?.lang || "Hindi";
  const userLocation = location.state?.userState || "Maharashtra";
  const sessionId = location.state?.sessionId || "dev_session";
  const initialQuestion =
    location.state?.initialQuestion || "Welcome to the assessment.";
  const initialAudioUrl = location.state?.initialAudioUrl || null;

  const { isRecording, startRecording, stopRecording } = useVoiceRecorder();

  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [stagedAudioBlob, setStagedAudioBlob] = useState(null);
  const [stagedAudioUrl, setStagedAudioUrl] = useState(null);

  const chatEndRef = useRef(null);

  useEffect(() => {
    setMessages([
      { sender: "ai", text: initialQuestion, audioUrl: initialAudioUrl },
    ]);
  }, [initialQuestion, initialAudioUrl]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing, stagedAudioUrl]);

  const handleRecordToggle = async () => {
    if (isRecording) {
      const audioBlob = await stopRecording();
      if (!audioBlob) return;
      setStagedAudioBlob(audioBlob);
      setStagedAudioUrl(URL.createObjectURL(audioBlob));
    } else {
      await startRecording();
    }
  };

  const handleCancelAudio = () => {
    // 🔥 FIX: Clean up memory leak
    if (stagedAudioUrl) URL.revokeObjectURL(stagedAudioUrl); 
    setStagedAudioBlob(null);
    setStagedAudioUrl(null);
  };

  const handleSendAudio = async () => {
    if (!stagedAudioBlob) return;

    setMessages((prev) => [
      ...prev,
      { sender: "user", audioUrl: stagedAudioUrl },
    ]);

    const blobToSend = stagedAudioBlob;
    setStagedAudioBlob(null);
    setStagedAudioUrl(null); // Keep URL alive in chat history

    setIsProcessing(true);
    const aiResult = await sendAudioToAI(blobToSend, sessionId, selectedLang); 
    setIsProcessing(false);

    if (aiResult?.audioUrl || aiResult?.text) {
      setMessages((prev) => [
        ...prev,
        { sender: "ai", text: aiResult.text, audioUrl: aiResult.audioUrl },
      ]);
    } else if (aiResult?.error) {
      alert(aiResult.error);
    } else {
      alert("AI is having trouble connecting.");
    }
  };

  const handleEndInterview = async () => {
    if (isProcessing) return;

    const confirmEnd = window.confirm(
      "Are you sure you want to end the assessment?",
    );
    if (!confirmEnd) return;

    setIsFinishing(true);

    try {
      const summaryData = await getInterviewSummary(sessionId);
      const finalScore = summaryData?.score || summaryData?.overall_score || 0;
      const isPass = finalScore >= 70;

      if (userId) {
        // 🔥 FIX: Using the abstracted API call instead of raw fetch
        await updateUserProfile({
          clerk_id: userId,
          user_name: user?.fullName || "Worker",
          skill_name: selectedSkill,
          score: finalScore,
          result: isPass ? "PASS" : "FAIL",
          state: userLocation,
          badges: isPass ? ["AI Verified", "Safety Cleared"] : ["Beginner"],
        });
      }

      if (summaryData) {
        navigate("/result", {
          state: { skill: selectedSkill, summary: summaryData },
        });
      } else {
        alert("Failed to generate summary.");
        setIsFinishing(false);
      }
    } catch (error) {
      console.error(error);
      setIsFinishing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-200">
      {/* HEADER */}
      <header className="bg-slate-800/50 border-b border-slate-700 p-4 flex items-center justify-between relative">
        <button onClick={() => navigate("/chooseskill")}>
          <ChevronLeft size={24} />
        </button>

        <h1 className="absolute left-1/2 -translate-x-1/2 font-bold">
          AI Mentor: {selectedSkill}
        </h1>

        <button onClick={handleEndInterview}>
          {isFinishing ? <Loader2 className="animate-spin" /> : <Flag />}
        </button>
      </header>

      {/* CHAT */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-900">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.sender === "user" ? "justify-end" : ""}`}
          >
            <div className={`p-4 rounded-xl max-w-[70%] ${msg.sender === "user" ? "bg-blue-600" : "bg-slate-800"}`}>
              {msg.text && <p className="mb-2">{msg.text}</p>}
              {msg.audioUrl && <audio src={msg.audioUrl} controls autoPlay={msg.sender === 'ai'} className={msg.sender === 'user' ? 'invert brightness-90' : ''} />}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex items-center gap-2 text-blue-400">
            <Loader2 className="animate-spin" size={16} />
            <span className="text-sm">Processing...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* FOOTER */}
      <div className="p-4 border-t border-slate-700 flex justify-center">
        {stagedAudioUrl ? (
          <div className="flex gap-3 items-center bg-slate-800 p-2 rounded-xl">
            <button onClick={handleCancelAudio} className="p-2 text-red-400 hover:bg-slate-700 rounded-lg">
              <Trash2 size={20} />
            </button>

            <audio src={stagedAudioUrl} controls className="h-10" />

            <button onClick={handleSendAudio} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500">
              <Send size={20} />
            </button>
          </div>
        ) : (
          <button 
            onClick={handleRecordToggle}
            className={`p-4 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-blue-600'}`}
          >
            {isRecording ? <Square size={24} /> : <Mic size={24} />}
          </button>
        )}
      </div>
    </div>
  );
}
