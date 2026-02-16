import { useCompany } from '@/contexts/CompanyContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2 } from 'lucide-react';

export function CompanySelector() {
  const { selectedCompany, setSelectedCompanyId, accessibleCompanies, isSuperAdmin } = useCompany();

  if (accessibleCompanies.length === 0) {
    return null;
  }

  // If only one company and not super admin, show as badge
  if (accessibleCompanies.length === 1 && !isSuperAdmin) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-lg">
        <Building2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{accessibleCompanies[0].name}</span>
      </div>
    );
  }

  const handleChange = (value: string) => {
    if (value === 'consolidated') {
      setSelectedCompanyId(null as any);
    } else {
      setSelectedCompanyId(value);
    }
  };

  return (
    <Select value={selectedCompany?.id || 'consolidated'} onValueChange={handleChange}>
      <SelectTrigger className="w-[200px] h-9">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          <SelectValue placeholder="Consolidated View" />
        </div>
      </SelectTrigger>
      <SelectContent className="bg-popover z-50">
        <SelectItem value="consolidated">
          <div className="flex items-center gap-2">
            <span className="font-medium">Consolidated</span>
            <span className="text-muted-foreground text-xs">(All)</span>
          </div>
        </SelectItem>
        {accessibleCompanies.map((company) => (
          <SelectItem key={company.id} value={company.id}>
            <div className="flex items-center gap-2">
              <span className="font-medium">{company.name}</span>
              <span className="text-muted-foreground text-xs">({company.code})</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
