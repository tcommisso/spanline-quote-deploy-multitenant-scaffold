import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Newspaper } from "lucide-react";

export default function DaNews() {
  const { data: articles, isLoading } = trpc.daPortal.listNews.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">News</h1>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse"><CardContent className="p-6"><div className="h-24 bg-muted rounded" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">News</h1>

      {(!articles || articles.length === 0) ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Newspaper className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No news articles yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {articles.map((article) => (
            <Card key={article.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{article.title}</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString("en-AU") : ""}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: article.content || "" }} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
