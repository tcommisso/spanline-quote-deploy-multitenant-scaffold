import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Phone, Mail } from "lucide-react";

export default function PortalContacts() {
  const contactsQuery = trpc.portal.getContacts.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Project Contacts</h1>
        <p className="text-muted-foreground">Your project team members</p>
      </div>

      {contactsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : !contactsQuery.data?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No contacts assigned yet</p>
            <p className="text-sm text-muted-foreground mt-1">Your project team contacts will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {contactsQuery.data.map((contact: any) => (
            <Card key={contact.id} className={`overflow-hidden ${contact.isMissing ? "bg-muted/30" : ""}`}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  {/* Photo or avatar */}
                  <div className="shrink-0">
                    {contact.photoUrl ? (
                      <img
                        src={contact.photoUrl}
                        alt={contact.name}
                        className="w-14 h-14 rounded-full object-cover border-2 border-primary/10"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-lg font-bold text-primary">
                          {contact.name?.charAt(0)?.toUpperCase() || "?"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Contact details */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div>
                      <p className="font-semibold text-base">{contact.name}</p>
                      <p className="text-sm text-muted-foreground font-medium">{contact.role}</p>
                    </div>

                    <div className="flex flex-col gap-1">
                      {contact.phone && (
                        <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                          <Phone className="w-3.5 h-3.5 shrink-0" /> {contact.phone}
                        </a>
                      )}
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-sm text-primary hover:underline truncate">
                          <Mail className="w-3.5 h-3.5 shrink-0" /> {contact.email}
                        </a>
                      )}
                      {!contact.phone && !contact.email && (
                        <p className="text-sm text-muted-foreground">Contact details to be confirmed.</p>
                      )}
                    </div>

                    {/* Profile description / When to contact */}
                    {contact.profileDescription && (
                      <div className="mt-2 pt-2 border-t">
                        <p className="text-xs text-muted-foreground italic leading-relaxed">
                          {contact.profileDescription}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
