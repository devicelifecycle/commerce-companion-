import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Info, ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface GuideSection {
  icon: React.ReactNode;
  title: string;
  content: React.ReactNode;
}

interface PageGuideProps {
  title?: string;
  sections: GuideSection[];
  columns?: 1 | 2;
}

export function PageGuide({ title = 'Quick Guide', sections, columns = 2 }: PageGuideProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors text-sm w-full">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium text-foreground">{title}</span>
          <ChevronDown className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        <div className={`grid grid-cols-1 ${columns === 2 ? 'lg:grid-cols-2' : ''} gap-4`}>
          {sections.map((section, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {section.icon}
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                {section.content}
              </CardContent>
            </Card>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
