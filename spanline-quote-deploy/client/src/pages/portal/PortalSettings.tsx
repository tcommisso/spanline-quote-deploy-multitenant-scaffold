import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Bell, Mail } from "lucide-react";

export default function PortalSettings() {
  const { data: prefs, isLoading } = trpc.portal.getNotificationPreferences.useQuery();
  const utils = trpc.useUtils();

  const updatePrefs = trpc.portal.updateNotificationPreferences.useMutation({
    onMutate: async (newPrefs) => {
      await utils.portal.getNotificationPreferences.cancel();
      const prev = utils.portal.getNotificationPreferences.getData();
      utils.portal.getNotificationPreferences.setData(undefined, newPrefs);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        utils.portal.getNotificationPreferences.setData(undefined, context.prev);
      }
      toast.error("Failed to update preferences");
    },
    onSuccess: () => {
      toast.success("Preferences updated");
    },
    onSettled: () => {
      utils.portal.getNotificationPreferences.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-muted border-t-foreground"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your portal preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notifications
          </CardTitle>
          <CardDescription>
            Control how you receive updates about your project
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div className="space-y-1">
                <Label htmlFor="email-notifications" className="text-sm font-medium">
                  Email notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Receive email alerts when new updates, photos, or documents are posted to your project
                </p>
              </div>
            </div>
            <Switch
              id="email-notifications"
              checked={prefs?.emailNotifications ?? true}
              onCheckedChange={(checked) => {
                updatePrefs.mutate({ emailNotifications: checked });
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
