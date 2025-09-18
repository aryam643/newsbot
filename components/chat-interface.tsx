"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"

import { SessionSidebar } from "@/components/session-sidebar"
import {
  Send,
  RotateCcw,
  MessageSquare,
  Newspaper,
  Clock,
  Wifi,
  WifiOff,
  History,
  Menu,
} from "lucide-react"

// --- Local history persistence (fallback when Redis is disabled) ---
const LS_HISTORY_PREFIX = "newsbot_history_";
function saveHistoryToLocal(sessionId: string, msgs: Message[]) {
  try { localStorage.setItem(LS_HISTORY_PREFIX + sessionId, JSON.stringify(msgs)); } catch {}
}
function getHistoryFromLocal(sessionId: string): Message[] | null {
  try {
    const raw = localStorage.getItem(LS_HISTORY_PREFIX + sessionId);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map((m:any)=>({ ...m, timestamp: new Date(m.timestamp) })) : null;
  } catch { return null; }
}
function clearHistoryFromLocal(sessionId: string) {
  try { localStorage.removeItem(LS_HISTORY_PREFIX + sessionId); } catch {}
}


import { cn } from "@/lib/utils"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

interface Message {
  id: string
  content: string
  role: "user" | "assistant"
  timestamp: Date
  sources?: string[]
  cached?: boolean
}

interface ConnectionStatus {
  isOnline: boolean
  lastPing: Date | null
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string>("")
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isOnline: true,
    lastPing: null,
  })
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
const sessionUpdaterRef = useRef<((messages: any[]) => void) | null>(null)

  // generate session ID on mount
  useEffect(() => {
    const newSessionId = `session_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`
    setSessionId(newSessionId)
    checkConnection()
  }, [])

  // auto scroll to bottom
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
    }
  }, [messages])

  // persist history on every change
  useEffect(() => {
    if (!sessionId) return
    saveHistoryToLocal(sessionId, messages)
    // also update sidebar via sessionUpdater
    if (sessionUpdaterRef.current) {
      sessionUpdaterRef.current(messages)
    }
  }, [messages, sessionId])


  // update session info in localStorage via SessionSidebar
  useEffect(() => {
    if (messages.length > 0 && sessionUpdaterRef.current) {
      sessionUpdaterRef.current(messages)
    }
  }, [messages])

  const checkConnection = useCallback(async () => {
    try {
      const response = await fetch("/api/health", { method: "GET", cache: "no-cache" })
      setConnectionStatus({ isOnline: response.ok, lastPing: new Date() })
    } catch {
      setConnectionStatus({ isOnline: false, lastPing: new Date() })
    }
  }, [])

  const loadSessionHistory = useCallback(async (sessionId: string) => {
    if (!sessionId) return
    setIsLoadingHistory(true)
    try {
      // Try local first
      const local = getHistoryFromLocal(sessionId)
      if (local && local.length) {
        setMessages(local)
        return
      }
      // Then server
      const response = await fetch(`/api/session/${sessionId}`, { cache: "no-cache" })
      if (response.ok) {
        const data = await response.json()
        const historyMessages = (data?.history ?? []).map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }))
        if (historyMessages.length) {
          setMessages(historyMessages)
          saveHistoryToLocal(sessionId, historyMessages)
        } else {
          setMessages([])
        }
      } else {
        // If server fails, keep any local (could be empty)
        const fallback = getHistoryFromLocal(sessionId) || []
        setMessages(fallback)
      }
    } finally {
      setIsLoadingHistory(false)
    }
}, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      content: input.trim(),
      role: "user",
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    const currentInput = input.trim()
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: currentInput, sessionId, history: messages }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      const assistantMessage: Message = {
        id: `msg_${Date.now()}_assistant`,
        content: data.response || "I couldn't generate a proper response.",
        role: "assistant",
        timestamp: new Date(),
        sources: data.sources || [],
        cached: data.cached || false,
      }
      setMessages((prev) => [...prev, assistantMessage])
      setConnectionStatus({ isOnline: true, lastPing: new Date() })
    } catch (error) {
      const errorMessage: Message = {
        id: `msg_${Date.now()}_error`,
        content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        role: "assistant",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
      setConnectionStatus({ isOnline: false, lastPing: new Date() })
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const resetSession = async () => {
    try {
      await fetch(`/api/session/${sessionId}`, { method: "DELETE" })
    } catch {}
    setMessages([])
    const newSessionId = `session_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`
    setSessionId(newSessionId)
    inputRef.current?.focus()
  }

  const handleNewSession = () => {
    const newSessionId = `session_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`
    setSessionId(newSessionId)
    setMessages([])
    inputRef.current?.focus()
  }

  const handleSessionSelect = async (id: string) => {
    if (id === sessionId) return
    setSessionId(id)
    await loadSessionHistory(id)
  }

  const handleDeleteSession = (id: string) => {
    if (id === sessionId) handleNewSession()
  }

  // hotkeys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "r") {
        e.preventDefault()
        resetSession()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault()
        handleNewSession()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault()
        setSidebarCollapsed(!sidebarCollapsed)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [sidebarCollapsed])

  return (
    <div className="flex min-h-screen overflow-hidden">
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Sidebar */}
        <ResizablePanel
          defaultSize={22}
          minSize={15}
          maxSize={30}
          collapsible
          collapsedSize={sidebarCollapsed ? 4 : undefined}
          className={cn(
            "transition-all duration-200",
            sidebarCollapsed && "min-w-[4rem] max-w-[4rem]"
          )}
        >
          <SessionSidebar
            currentSessionId={sessionId}
            onSessionSelect={handleSessionSelect}
            onNewSession={handleNewSession}
            onDeleteSession={handleDeleteSession}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            onUpdateSession={(updater) => {
              sessionUpdaterRef.current = updater // ✅ save updater
            }}
          />
        </ResizablePanel>

        <ResizableHandle
          withHandle
          className="bg-border hover:bg-primary/50 transition cursor-col-resize"
        />

        {/* Main Chat */}
        <ResizablePanel className="flex flex-col">
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header */}
            <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className="md:hidden"
                  >
                    <Menu className="w-4 h-4" />
                  </Button>
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary text-primary-foreground">
                    <Newspaper className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-foreground font-[family-name:var(--font-space-grotesk)]">
                      NewsBot
                    </h1>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">
                        Ask questions about the latest news
                      </p>
                      {connectionStatus.isOnline ? (
                        <Wifi className="w-3 h-3 text-green-500" />
                      ) : (
                        <WifiOff className="w-3 h-3 text-red-500" />
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => loadSessionHistory(sessionId)}
                    disabled={isLoadingHistory}
                    className="gap-2"
                  >
                    <History className="w-4 h-4" />
                    {isLoadingHistory ? "Loading..." : "History"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetSession}
                    className="gap-2 bg-transparent"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </Button>
                </div>
              </div>
            </header>

            {!connectionStatus.isOnline && (
              <Alert className="m-4 border-destructive/50 text-destructive">
                <WifiOff className="h-4 w-4" />
                <AlertDescription>
                  Connection lost. Some features may not work.
                  {connectionStatus.lastPing && (
                    <span className="text-xs block mt-1">
                      Last connected: {connectionStatus.lastPing.toLocaleTimeString()}
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex-1 flex flex-col mx-auto w-full max-w-3xl">
              {/* Messages */}
              <ScrollArea className="flex-1 p-4 overflow-y-auto" ref={scrollAreaRef}>
                <div className="space-y-4">
                  {messages.length === 0 && !isLoadingHistory && (
                    <div className="text-center py-12">
                      <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-foreground mb-2">
                        Welcome to NewsBot
                      </h3>
                      <p className="text-muted-foreground max-w-md mx-auto mb-4">
                        Ask me anything about recent news articles. I'll search and
                        provide accurate, sourced information.
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
                        <Badge
                          variant="secondary"
                          className="cursor-pointer"
                          onClick={() => setInput("What's the latest technology news?")}
                        >
                          Technology news
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="cursor-pointer"
                          onClick={() => setInput("Tell me about recent political developments")}
                        >
                          Political updates
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="cursor-pointer"
                          onClick={() => setInput("What are the breaking news stories today?")}
                        >
                          Breaking news
                        </Badge>
                      </div>
                    </div>
                  )}

                  {isLoadingHistory && (
                    <div className="text-center py-8">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm text-muted-foreground">
                          Loading session history...
                        </span>
                      </div>
                    </div>
                  )}

                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "flex gap-3 max-w-3xl",
                        m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0",
                          m.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {m.role === "user" ? "U" : <Newspaper className="w-4 h-4" />}
                      </div>

                      <Card
                        className={cn(
                          "p-4 max-w-[80%] relative",
                          m.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-card"
                        )}
                      >
                        {m.cached && (
                          <Badge
                            variant="secondary"
                            className="absolute -top-2 -right-2 text-xs"
                          >
                            <Clock className="w-3 h-3 mr-1" />
                            Cached
                          </Badge>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                        {m.sources && (
                          <div className="mt-3 pt-3 border-t border-border/20">
                            <p className="text-xs text-muted-foreground mb-2">Sources:</p>
                            {m.sources.map((s, i) => (
                              <p key={i} className="text-xs text-muted-foreground">
                                • {s}
                              </p>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground/70 mt-2">
                          {m.timestamp.toLocaleTimeString()}
                        </p>
                      </Card>
                    </div>
                  ))}

                  {isLoading && (
                    <div className="flex gap-3 max-w-3xl mr-auto">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground">
                        <Newspaper className="w-4 h-4" />
                      </div>
                      <Card className="p-4 bg-card">
                        <span className="text-sm text-muted-foreground">
                          Searching news articles...
                        </span>
                      </Card>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="border-t border-border bg-card/50 p-4">
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask me about recent news... (Ctrl+K to focus)"
                    disabled={isLoading}
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="gap-2"
                  >
                    <Send className="w-4 h-4" /> Send
                  </Button>
                </form>
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <p>Session: {sessionId.split("_")[1]}</p>
                  <p>Ctrl+K focus • Ctrl+R reset • Ctrl+N new • Ctrl+B sidebar</p>
                </div>
              </div>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}