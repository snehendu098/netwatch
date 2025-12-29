"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Search,
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Loader2,
} from "lucide-react";
import Image from "next/image";
import { format } from "date-fns";
import { toast } from "sonner";

interface Screenshot {
  id: string;
  imageUrl: string | null;
  capturedAt: string;
  activeWindow: string | null;
  computer: {
    name: string;
    hostname: string;
  };
}

interface Computer {
  id: string;
  name: string;
}

interface ScreenshotsClientProps {
  initialScreenshots: Screenshot[];
  computers: Computer[];
}

export function ScreenshotsClient({ initialScreenshots, computers }: ScreenshotsClientProps) {
  const [screenshots, setScreenshots] = useState<Screenshot[]>(initialScreenshots);
  const [selectedComputer, setSelectedComputer] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredScreenshots = screenshots.filter((screenshot) => {
    const matchesComputer = selectedComputer === "all" ||
      screenshot.computer.name.toLowerCase().includes(selectedComputer.toLowerCase());
    const matchesSearch = searchQuery === "" ||
      screenshot.computer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      screenshot.activeWindow?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesComputer && matchesSearch;
  });

  const currentScreenshot = filteredScreenshots[currentIndex];

  const openViewer = (index: number) => {
    setCurrentIndex(index);
    setZoom(1);
    setViewerOpen(true);
  };

  const closeViewer = () => {
    setViewerOpen(false);
    setZoom(1);
  };

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : filteredScreenshots.length - 1));
    setZoom(1);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < filteredScreenshots.length - 1 ? prev + 1 : 0));
    setZoom(1);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this screenshot?")) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/screenshots/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");

      setScreenshots(screenshots.filter((s) => s.id !== id));
      toast.success("Screenshot deleted");

      // Close viewer if we deleted the current screenshot
      if (currentScreenshot?.id === id) {
        if (filteredScreenshots.length <= 1) {
          closeViewer();
        } else {
          setCurrentIndex((prev) => Math.min(prev, filteredScreenshots.length - 2));
        }
      }
    } catch (error) {
      toast.error("Failed to delete screenshot");
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = (screenshot: Screenshot) => {
    if (!screenshot.imageUrl) return;

    const link = document.createElement("a");
    link.href = screenshot.imageUrl;
    link.download = `screenshot-${screenshot.computer.name}-${format(new Date(screenshot.capturedAt), "yyyy-MM-dd-HHmmss")}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") goToPrevious();
    if (e.key === "ArrowRight") goToNext();
    if (e.key === "Escape") closeViewer();
    if (e.key === "+" || e.key === "=") handleZoomIn();
    if (e.key === "-") handleZoomOut();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Screenshots</h1>
          <p className="text-muted-foreground">
            View captured screenshots from all monitored computers
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search screenshots..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={selectedComputer} onValueChange={setSelectedComputer}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select computer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Computers</SelectItem>
                {computers.map((computer) => (
                  <SelectItem key={computer.id} value={computer.name}>
                    {computer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredScreenshots.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No screenshots found</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredScreenshots.map((screenshot, index) => (
                <Card
                  key={screenshot.id}
                  className="overflow-hidden cursor-pointer group"
                  onClick={() => openViewer(index)}
                >
                  <div className="relative aspect-video bg-muted">
                    {screenshot.imageUrl ? (
                      <Image
                        src={screenshot.imageUrl}
                        alt={`Screenshot from ${screenshot.computer.name}`}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                        unoptimized
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        No image
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Maximize2 className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <CardContent className="p-3">
                    <p className="font-medium truncate">{screenshot.computer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(screenshot.capturedAt), "PPp")}
                    </p>
                    {screenshot.activeWindow && (
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {screenshot.activeWindow}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image Viewer Modal */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent
          className="max-w-[95vw] max-h-[95vh] w-full h-full p-0"
          onKeyDown={handleKeyDown}
        >
          <DialogHeader className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/70 to-transparent p-4">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-white">
                {currentScreenshot?.computer.name} -{" "}
                {currentScreenshot && format(new Date(currentScreenshot.capturedAt), "PPp")}
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={handleZoomOut}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-white text-sm">{Math.round(zoom * 100)}%</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={handleZoomIn}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={() => currentScreenshot && handleDownload(currentScreenshot)}
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={() => currentScreenshot && handleDelete(currentScreenshot.id)}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={closeViewer}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex items-center justify-center w-full h-full bg-black overflow-auto">
            {currentScreenshot?.imageUrl && (
              <img
                src={currentScreenshot.imageUrl}
                alt={`Screenshot from ${currentScreenshot.computer.name}`}
                style={{ transform: `scale(${zoom})` }}
                className="max-w-none transition-transform"
              />
            )}
          </div>

          {/* Navigation */}
          {filteredScreenshots.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white bg-black/50 hover:bg-black/70 h-12 w-12"
                onClick={goToPrevious}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white bg-black/50 hover:bg-black/70 h-12 w-12"
                onClick={goToNext}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </>
          )}

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm">
            {currentIndex + 1} / {filteredScreenshots.length}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
