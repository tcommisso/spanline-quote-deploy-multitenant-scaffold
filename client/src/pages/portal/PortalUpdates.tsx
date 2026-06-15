import { usePortal } from "@/contexts/PortalContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare, StickyNote, Camera, Paperclip, MessageCircle, Mail,
  ExternalLink, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const typeIcons: Record<string, typeof StickyNote> = {
  note: StickyNote,
  photo: Camera,
  file: Paperclip,
  sms: MessageCircle,
  email: Mail,
};

const typeLabels: Record<string, string> = {
  note: "Note",
  photo: "Photo",
  file: "File",
  sms: "SMS",
  email: "Email",
};

export default function PortalUpdates() {
  const { user } = usePortal();
  const { data: activities, isLoading } = trpc.portal.getPortalActivities.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Project Updates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Communications and updates from your project team
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-24 bg-muted rounded-lg" />
            </div>
          ))}
        </div>
      ) : !activities || activities.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold text-lg">No updates yet</h3>
            <p className="text-muted-foreground mt-1">
              Your project team will share updates here as your project progresses.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {activities.map((activity) => {
            const Icon = typeIcons[activity.type] || StickyNote;
            return (
              <Card key={activity.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {typeLabels[activity.type] || activity.type}
                        </Badge>
                        {activity.title && (
                          <span className="font-medium text-sm">{activity.title}</span>
                        )}
                      </div>
                      {activity.content && (
                        <p className="text-sm mt-2 whitespace-pre-wrap text-foreground/90">
                          {activity.content}
                        </p>
                      )}
                      {activity.fileUrl && (
                        <div className="mt-2">
                          {activity.type === "photo" && activity.fileMimeType?.startsWith("image/") ? (
                            <a href={activity.fileUrl} target="_blank" rel="noopener noreferrer">
                              <img
                                src={activity.fileUrl}
                                alt={activity.fileName || "Photo"}
                                className="max-w-full sm:max-w-sm rounded-lg border cursor-pointer hover:opacity-90 transition"
                              />
                            </a>
                          ) : (
                            <Button variant="outline" size="sm" asChild>
                              <a href={activity.fileUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                {activity.fileName || "View attachment"}
                              </a>
                            </Button>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(activity.createdAt).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {activity.createdByName && (
                          <span>by {activity.createdByName}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
