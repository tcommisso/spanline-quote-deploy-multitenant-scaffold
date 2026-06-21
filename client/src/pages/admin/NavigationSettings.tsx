import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { APP_SECTIONS } from "@/lib/appSections";
import { MOBILE_NAV_DESTINATION_LIST } from "@/lib/navigationDestinations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ROLE_LABELS, PERMISSION_MATRIX_ROLES, type UserRole } from "@shared/const";
import {
  getDefaultNavigationSettings,
  normalizeNavigationSettings,
  type AppCentralSectionId,
  type MobileNavItemId,
  type NavigationSettings,
  type RoleNavigationSettings,
} from "@shared/navigation-config";
import { ArrowDown, ArrowUp, LayoutGrid, RotateCcw, Save, Smartphone } from "lucide-react";
import { toast } from "sonner";

function moveValue<T extends string>(values: T[], value: T, delta: -1 | 1) {
  const index = values.indexOf(value);
  const nextIndex = index + delta;
  if (index < 0 || nextIndex < 0 || nextIndex >= values.length) return values;
  const next = [...values];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

export default function NavigationSettings() {
  const utils = trpc.useUtils();
  const defaultSettings = useMemo(() => getDefaultNavigationSettings(), []);
  const [activeRole, setActiveRole] = useState<UserRole>("design_adviser");
  const [settings, setSettings] = useState<NavigationSettings>(defaultSettings);

  const { data: savedSettings, isLoading } = trpc.globalSettings.getNavigationSettings.useQuery();
  const saveMutation = trpc.globalSettings.setNavigationSettings.useMutation({
    onSuccess: (saved) => {
      setSettings(normalizeNavigationSettings(saved));
      utils.globalSettings.getNavigationSettings.invalidate();
      toast.success("Navigation settings saved");
    },
    onError: (err) => toast.error(err.message || "Failed to save navigation settings"),
  });

  useEffect(() => {
    if (savedSettings) setSettings(normalizeNavigationSettings(savedSettings));
  }, [savedSettings]);

  const sectionById = useMemo(() => new Map(APP_SECTIONS.map(section => [section.id, section])), []);
  const roleSettings = settings.roles[activeRole] ?? defaultSettings.roles[activeRole];
  const selectedAppSections = roleSettings.appCentralSectionIds;
  const selectedMobileItems = roleSettings.mobileBottomNavIds;

  const orderedAppSections = useMemo(() => {
    const selected = selectedAppSections
      .map(sectionId => sectionById.get(sectionId))
      .filter(Boolean);
    const unselected = APP_SECTIONS.filter(section => !selectedAppSections.includes(section.id as AppCentralSectionId));
    return [...selected, ...unselected];
  }, [sectionById, selectedAppSections]);

  const updateActiveRole = (updater: (current: RoleNavigationSettings) => RoleNavigationSettings) => {
    setSettings(current => {
      const normalized = normalizeNavigationSettings(current);
      return {
        roles: {
          ...normalized.roles,
          [activeRole]: updater(normalized.roles[activeRole]),
        },
      };
    });
  };

  const toggleAppSection = (sectionId: AppCentralSectionId, checked: boolean) => {
    updateActiveRole(current => ({
      ...current,
      appCentralSectionIds: checked
        ? [...current.appCentralSectionIds, sectionId].filter((id, index, list) => list.indexOf(id) === index)
        : current.appCentralSectionIds.filter(id => id !== sectionId),
    }));
  };

  const toggleMobileItem = (itemId: MobileNavItemId, checked: boolean) => {
    updateActiveRole(current => {
      const currentIds = current.mobileBottomNavIds;
      if (checked && currentIds.length >= 4 && !currentIds.includes(itemId)) return current;
      return {
        ...current,
        mobileBottomNavIds: checked
          ? [...currentIds, itemId].filter((id, index, list) => list.indexOf(id) === index).slice(0, 4)
          : currentIds.filter(id => id !== itemId),
      };
    });
  };

  const resetRole = () => {
    updateActiveRole(() => defaultSettings.roles[activeRole]);
  };

  const resetAll = () => {
    setSettings(defaultSettings);
  };

  const save = () => {
    saveMutation.mutate(settings);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <LayoutGrid className="h-6 w-6 text-primary" />
            Navigation Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure App Central tile order and the four mobile bottom navigation items by role.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={resetAll} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset All
          </Button>
          <Button onClick={save} disabled={saveMutation.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            Save Settings
          </Button>
        </div>
      </div>

      <Tabs value={activeRole} onValueChange={(value) => setActiveRole(value as UserRole)}>
        <TabsList className="h-auto flex flex-wrap justify-start w-full sm:w-fit">
          {PERMISSION_MATRIX_ROLES.map(role => (
            <TabsTrigger key={role} value={role} className="text-xs sm:text-sm">
              {ROLE_LABELS[role]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{ROLE_LABELS[activeRole]}</h2>
          <p className="text-xs text-muted-foreground">
            Existing permissions still hide destinations this role cannot access.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetRole} className="gap-2 w-full sm:w-auto">
          <RotateCcw className="h-4 w-4" />
          Reset Role
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-primary" />
              App Central Tiles
            </CardTitle>
            <CardDescription>
              Selected tiles appear on App Central in this order on mobile and desktop.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {orderedAppSections.map(section => {
              if (!section) return null;
              const sectionId = section.id as AppCentralSectionId;
              const checked = selectedAppSections.includes(sectionId);
              const selectedIndex = selectedAppSections.indexOf(sectionId);
              return (
                <div key={section.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                  <Checkbox
                    id={`app-central-${section.id}`}
                    checked={checked}
                    onCheckedChange={(value) => toggleAppSection(sectionId, Boolean(value))}
                  />
                  <section.icon className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor={`app-central-${section.id}`} className="flex-1 cursor-pointer text-sm font-medium">
                    {section.label}
                  </Label>
                  {checked && <Badge variant="secondary">{selectedIndex + 1}</Badge>}
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      disabled={!checked || selectedIndex <= 0}
                      onClick={() => updateActiveRole(current => ({
                        ...current,
                        appCentralSectionIds: moveValue(current.appCentralSectionIds, sectionId, -1),
                      }))}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      disabled={!checked || selectedIndex < 0 || selectedIndex >= selectedAppSections.length - 1}
                      onClick={() => updateActiveRole(current => ({
                        ...current,
                        appCentralSectionIds: moveValue(current.appCentralSectionIds, sectionId, 1),
                      }))}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary" />
              Mobile Bottom Nav
            </CardTitle>
            <CardDescription>
              Choose up to four items. Their order here is the order shown in mobile mode.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Selected</span>
              <Badge variant={selectedMobileItems.length === 4 ? "default" : "outline"}>
                {selectedMobileItems.length}/4
              </Badge>
            </div>
            <Separator />
            <div className="space-y-2">
              {MOBILE_NAV_DESTINATION_LIST.map(item => {
                const checked = selectedMobileItems.includes(item.id);
                const selectedIndex = selectedMobileItems.indexOf(item.id);
                const disabled = !checked && selectedMobileItems.length >= 4;
                return (
                  <div key={item.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                    <Checkbox
                      id={`mobile-nav-${item.id}`}
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(value) => toggleMobileItem(item.id, Boolean(value))}
                    />
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                    <Label
                      htmlFor={`mobile-nav-${item.id}`}
                      className={`flex-1 cursor-pointer text-sm font-medium ${disabled ? "text-muted-foreground" : ""}`}
                    >
                      {item.label}
                    </Label>
                    {checked && <Badge variant="secondary">{selectedIndex + 1}</Badge>}
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        disabled={!checked || selectedIndex <= 0}
                        onClick={() => updateActiveRole(current => ({
                          ...current,
                          mobileBottomNavIds: moveValue(current.mobileBottomNavIds, item.id, -1),
                        }))}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        disabled={!checked || selectedIndex < 0 || selectedIndex >= selectedMobileItems.length - 1}
                        onClick={() => updateActiveRole(current => ({
                          ...current,
                          mobileBottomNavIds: moveValue(current.mobileBottomNavIds, item.id, 1),
                        }))}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
