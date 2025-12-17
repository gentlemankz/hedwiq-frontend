import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account preferences and application settings
          </p>
        </div>

        {/* Coming Soon Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="size-5" />
              User Preferences
            </CardTitle>
            <CardDescription>
              Configure your personal settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Settings className="size-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">Coming Soon</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                User settings and preferences will be available here in a future
                update. Stay tuned for notification preferences, display
                settings, and more.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
