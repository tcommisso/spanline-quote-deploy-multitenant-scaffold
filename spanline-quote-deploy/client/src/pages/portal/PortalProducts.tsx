import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingBag } from "lucide-react";
import { toast } from "sonner";

export default function PortalProducts() {
  const productsQuery = trpc.portal.getProducts.useQuery();
  const utils = trpc.useUtils();

  const handleEnquire = (productName: string) => {
    toast.success(`Enquiry for "${productName}" noted! We'll be in touch soon.`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Products & Services</h1>
        <p className="text-muted-foreground">Additional offerings to enhance your outdoor living</p>
      </div>

      {productsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : !productsQuery.data?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShoppingBag className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No products available yet</p>
            <p className="text-sm text-muted-foreground mt-1">Check back later for additional products and services.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {productsQuery.data.map((product) => (
            <Card key={product.id}>
              <CardContent className="pt-6">
                {product.imageUrl && (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-40 object-cover rounded-lg mb-4"
                  />
                )}
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold">{product.name}</h3>
                  {product.priceFrom && (
                    <Badge variant="secondary" className="text-sm">
                      From ${product.priceFrom}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-4">{product.description}</p>
                {product.isFeatured && (
                  <Badge className="mb-3 bg-primary/10 text-primary">Featured</Badge>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleEnquire(product.name)}
                >
                  {product.ctaLabel || "Enquire Now"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
