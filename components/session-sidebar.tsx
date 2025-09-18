"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, Plus, Trash2, Clock, User, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"


const LS_HISTORY_PREFIX = "newsbot_history_";
function getCountFromLocal(sessionId: string): number {
  try {
    const raw = localStorage.getItem(LS_HISTORY_PREFIX + sessionId);
    if (!raw) return 0;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.length : 0;
  } catch { return 0; }
}


interface SessionInfo {
  id: string
  title: string
  messageCount: number
  lastActivity: Date
  createdAt: Date
  preview: string
}

interface SessionSidebarProps {
  currentSessionId: string
  onSessionSelect: (sessionId: string) => void
  onNewSession: () => void
  onDeleteSession: (sessionId: string) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
  onUpdateSession: (updateFn: (messages: any[]) => void) => void
}

export function SessionSidebar({
  currentSessionId,
  onSessionSelect,
  onNewSession,
  onDeleteSession,
  isCollapsed,
  onToggleCollapse,
  onUpdateSession,
}: SessionSidebarProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Load sessions from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      loadSessions()
    }
  }, [])

  const loadSessions = () => {
    try {
      const storedSessions = localStorage.getItem("newsbot_sessions")
      if (storedSessions) {
        const parsed = JSON.parse(storedSessions)
        const sessionsWithDates = parsed.map((session: any) => ({
          ...session,
          lastActivity: new Date(session.lastActivity),
          createdAt: new Date(session.createdAt),
        }))
        setSessions(
          sessionsWithDates.sort(
            (a: SessionInfo, b: SessionInfo) =>
              b.lastActivity.getTime() - a.lastActivity.getTime(),
          ),
        )
      }
    } catch (error) {
      console.error("[v0] Error loading sessions:", error)
    }
  }

  const saveSession = (sessionInfo: SessionInfo) => {
    try {
      const updatedSessions = sessions.filter((s) => s.id !== sessionInfo.id)
      updatedSessions.unshift(sessionInfo)

      // Keep only last 20 sessions
      const limitedSessions = updatedSessions.slice(0, 20)

      setSessions(limitedSessions)
      localStorage.setItem("newsbot_sessions", JSON.stringify(limitedSessions))
    } catch (error) {
      console.error("[v0] Error saving session:", error)
    }
  }

  const updateCurrentSession = (messages: any[]) => {
    if (messages.length === 0) return

    const lastUserMessage = messages.filter((m) => m.role === "user").pop()
    const title = lastUserMessage?.content?.substring(0, 50) + "..." || "New Chat"
    const preview = messages[messages.length - 1]?.content?.substring(0, 100) + "..." || ""

    const sessionInfo: SessionInfo = {
      id: currentSessionId,
      title,
      messageCount: messages.length,
      lastActivity: new Date(),
      createdAt: sessions.find((s) => s.id === currentSessionId)?.createdAt || new Date(),
      preview,
    }

    saveSession(sessionInfo)
  }

  // Pass updater to parent
  useEffect(() => {
    onUpdateSession(updateCurrentSession)
  }, [currentSessionId, sessions])

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    try {
      setIsLoading(true)

      // Delete from backend
      await fetch(`/api/session/${sessionId}`, {
        method: "DELETE",
      })

      // Remove from local storage
      const updatedSessions = sessions.filter((s) => s.id !== sessionId)
      setSessions(updatedSessions)
      localStorage.setItem("newsbot_sessions", JSON.stringify(updatedSessions))

      // Call parent handler
      onDeleteSession(sessionId)
    } catch (error) {
      console.error("[v0] Error deleting session:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatRelativeTime = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  useEffect(() => {
    setSessions(prev => prev.map(s => ({ ...s, messageCount: getCountFromLocal(s.id) })))
  }, [])

  if (isCollapsed) {
    
return (
      <div className="h-full border-r border-border bg-card/50 flex flex-col items-center py-4 gap-2">
        <Button variant="ghost" size="sm" onClick={onToggleCollapse} className="w-8 h-8 p-0">
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onNewSession} className="w-8 h-8 p-0">
          <Plus className="w-4 h-4" />
        </Button>
        <div className="flex-1 flex flex-col gap-1 overflow-hidden">
          {sessions.slice(0, 8).map((session) => (
            <Button
              key={session.id}
              variant={session.id === currentSessionId ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onSessionSelect(session.id)}
              className="w-8 h-8 p-0"
              title={session.title}
            >
              <MessageSquare className="w-3 h-3" />
            </Button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full border-r border-border bg-card/50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground font-[family-name:var(--font-space-grotesk)]">Chat Sessions</h2>
          <Button variant="ghost" size="sm" onClick={onToggleCollapse} className="w-8 h-8 p-0">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
        <Button onClick={onNewSession} className="w-full gap-2" size="sm">
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
      </div>

      {/* Session Stats */}
      <div className="p-4 border-b border-border">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-lg font-bold text-primary">{sessions.length}</div>
            <div className="text-xs text-muted-foreground">Total Sessions</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-primary">{sessions.reduce((sum, s) => sum + s.messageCount, 0)}</div>
            <div className="text-xs text-muted-foreground">Total Messages</div>
          </div>
        </div>
      </div>

      {/* Sessions List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No chat sessions yet</p>
              <p className="text-xs">Start a conversation to see your history</p>
            </div>
          ) : (
            sessions.map((session) => (
              <Card
                key={session.id}
                className={cn(
                  "p-3 cursor-pointer hover:bg-accent/50 transition-colors",
                  session.id === currentSessionId && "bg-accent border-primary/50",
                )}
                onClick={() => onSessionSelect(session.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm text-foreground truncate font-[family-name:var(--font-dm-sans)]">
                      {session.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{session.preview}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        <MessageSquare className="w-3 h-3 mr-1" />
                        {session.messageCount}
                      </Badge>
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatRelativeTime(session.lastActivity)}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    disabled={isLoading}
                    className="w-6 h-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <User className="w-3 h-3" />
          <span>Sessions auto-saved locally</span>
        </div>
      </div>
    </div>
  )
}