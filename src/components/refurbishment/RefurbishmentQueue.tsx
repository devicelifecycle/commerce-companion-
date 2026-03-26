import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { Eye, Wrench, Clock, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

interface RefurbishmentQueueProps {
  devices: any[];
  isLoading: boolean;
  onSelect: (id: string) => void;
  canManage: boolean;
  isCompletedView?: boolean;
}

const statusBadge = (status: string) => {
  switch (status) {
    case 'pending': return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
    case 'in_progress': return <Badge variant="secondary" className="gap-1"><Wrench className="h-3 w-3" /> In Progress</Badge>;
    case 'completed': return <Badge className="gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
};

export function RefurbishmentQueue({ devices, isLoading, onSelect, canManage, isCompletedView }: RefurbishmentQueueProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {isCompletedView ? 'Recently Completed' : 'Devices Awaiting Refurbishment'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TableSkeleton columns={7} rows={5} />
        ) : devices.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {isCompletedView ? 'No completed refurbishments yet.' : 'No devices in the refurbishment queue.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>IMEI</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>{isCompletedView ? 'Completed' : 'Imported'}</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((d: any) => (
                <TableRow key={d.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelect(d.id)}>
                  <TableCell className="font-medium">{d.brand} {d.model} {d.storage && `(${d.storage})`}</TableCell>
                  <TableCell className="font-mono text-xs">{d.imei || '—'}</TableCell>
                  <TableCell><Badge variant="outline">{d.condition}</Badge></TableCell>
                  <TableCell>{d.suppliers?.name || '—'}</TableCell>
                  <TableCell>${Number(d.cost_price).toFixed(2)}</TableCell>
                  <TableCell>{statusBadge(d.refurbishment_status || 'pending')}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {isCompletedView && d.refurbishment_completed_at
                      ? format(new Date(d.refurbishment_completed_at), 'MMM d, yyyy')
                      : d.created_at ? format(new Date(d.created_at), 'MMM d, yyyy') : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4 mr-1" /> {canManage ? 'Inspect' : 'View'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
