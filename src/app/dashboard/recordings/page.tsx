"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Download, Play, Calendar, Video, Trash2, RefreshCw, Circle, X } from "lucide-react";
import { toast } from "sonner";

interface Computer {
  id: string;
  name: string;
  hostname: string;
}

interface Recording {
  id: string;
  computerId: string;
  computer: Computer;
  videoUrl: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number;
  thumbnailUrl: string | null;
  status: string;
  duration: number;
  startedAt: string;
  endedAt: string | null;
}

interface RecordingsResponse {
  recordings: Recording[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  storage: {
    used: number;
    limit: number;
  };
}

export default function RecordingsPage() {
  const [data, setData] = useState<RecordingsResponse | null>(null);
  const [computers, setComputers] = useState<Computer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedComputer, setSelectedComputer] = useState<string>("all");
  const [playerOpen, setPlayerOpen] = useState(false);
  const [currentRecording, setCurrentRecording] = useState<Recording | null>(null);

  const openPlayer = (recording: Recording) => {
    setCurrentRecording(recording);
    setPlayerOpen(true);
  };

  const closePlayer = () => {
    setPlayerOpen(false);
    setCurrentRecording(null);
  };

  useEffect(() => {
    fetchRecordings();
    fetchComputers();
  }, [selectedComputer]);

  const fetchRecordings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedComputer !== "all") {
        params.set("computerId", selectedComputer);
      }
      const res = await fetch(`/api/recordings?${params}`);
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error("Error fetching recordings:", error);
      toast.error("Failed to fetch recordings");
    } finally {
      setLoading(false);
    }
  };

  const fetchComputers = async () => {
    try {
      const res = await fetch("/api/computers");
      const json = await res.json();
      setComputers(json);
    } catch (error) {
      console.error("Error fetching computers:", error);
    }
  };

  const deleteRecording = async (id: string) => {
    if (!confirm("Are you sure you want to delete this recording?")) return;

    try {
      const res = await fetch(`/api/recordings/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Recording deleted");
        fetchRecordings();
      } else {
        toast.error("Failed to delete recording");
      }
    } catch (error) {
      console.error("Error deleting recording:", error);
      toast.error("Failed to delete recording");
    }
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "RECORDING":
        return <Badge variant="default" className="gap-1"><Circle className="h-2 w-2 fill-current animate-pulse" />Recording</Badge>;
      case "COMPLETED":
        return <Badge variant="secondary">Completed</Badge>;
      case "FAILED":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredRecordings = data?.recordings.filter(
    (recording) =>
      recording.computer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      recording.computer.hostname.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const storagePercentage = data?.storage
    ? (data.storage.used / data.storage.limit) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recordings</h1>
          <p className="text-muted-foreground">
            View and manage screen recordings from monitored computers
          </p>
        </div>
        <Button onClick={fetchRecordings} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search recordings..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={selectedComputer} onValueChange={setSelectedComputer}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Computers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Computers</SelectItem>
                {computers.map((computer) => (
                  <SelectItem key={computer.id} value={computer.id}>
                    {computer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRecordings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Video className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No recordings found</p>
              <p className="text-sm">Screen recordings will appear here when captured</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRecordings.map((recording) => (
                <Card key={recording.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-24 items-center justify-center rounded-lg bg-muted">
                        {recording.thumbnailUrl ? (
                          <img
                            src={recording.thumbnailUrl}
                            alt="Thumbnail"
                            className="h-full w-full object-cover rounded-lg"
                          />
                        ) : (
                          <Video className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{recording.computer.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(recording.startedAt).toLocaleString()}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          {getStatusBadge(recording.status)}
                          <Badge variant="outline">{formatDuration(recording.duration)}</Badge>
                          <Badge variant="secondary">{formatFileSize(recording.fileSize)}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {recording.videoUrl && recording.status === "COMPLETED" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPlayer(recording)}
                          >
                            <Play className="mr-2 h-4 w-4" />
                            Play
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <a href={recording.videoUrl} download>
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteRecording(recording.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storage Usage</CardTitle>
          <CardDescription>Recording storage allocation and usage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Used: {formatFileSize(data?.storage.used || 0)}</span>
              <span>Total: {formatFileSize(data?.storage.limit || 50 * 1024 * 1024 * 1024)}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className={`h-2 rounded-full ${storagePercentage > 90 ? "bg-destructive" : storagePercentage > 70 ? "bg-yellow-500" : "bg-primary"}`}
                style={{ width: `${Math.min(storagePercentage, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatFileSize((data?.storage.limit || 0) - (data?.storage.used || 0))} available.
              Recordings are automatically deleted after 30 days.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Video Player Modal */}
      <Dialog open={playerOpen} onOpenChange={setPlayerOpen}>
        <DialogContent className="max-w-4xl p-0">
          <DialogHeader className="p-4 pb-0">
            <div className="flex items-center justify-between">
              <DialogTitle>
                {currentRecording?.computer.name} -{" "}
                {currentRecording && new Date(currentRecording.startedAt).toLocaleString()}
              </DialogTitle>
              <div className="flex items-center gap-2">
                {currentRecording?.videoUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={currentRecording.videoUrl} download>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>
          <div className="p-4 pt-2">
            {currentRecording?.videoUrl ? (
              <video
                src={currentRecording.videoUrl}
                controls
                autoPlay
                className="w-full rounded-lg bg-black"
                style={{ maxHeight: "70vh" }}
              >
                Your browser does not support the video tag.
              </video>
            ) : (
              <div className="flex items-center justify-center h-64 bg-muted rounded-lg">
                <p className="text-muted-foreground">Video not available</p>
              </div>
            )}
            {currentRecording && (
              <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                <span>Duration: {formatDuration(currentRecording.duration)}</span>
                <span>Size: {formatFileSize(currentRecording.fileSize)}</span>
                <span>Status: {currentRecording.status}</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
