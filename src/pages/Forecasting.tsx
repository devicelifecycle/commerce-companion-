import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  Brain, TrendingUp, Package, DollarSign, Loader2, 
  Sparkles, AlertTriangle, CheckCircle, ArrowUpRight, ArrowDownRight 
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface RevenueForecast {
  forecast: Array<{ month: string; predicted_revenue: number; confidence: string }>;
  trend: string;
  insights: string[];
  recommendations: string[];
}

interface InventoryForecast {
  recommendations: Array<{ brand: string; action: string; quantity: number; reason: string }>;
  alerts: Array<{ type: string; message: string }>;
  optimal_stock_level: number;
  insights: string[];
}

interface ProfitForecast {
  profit_forecast: Array<{ month: string; predicted_profit: number; margin_percentage: number }>;
  cost_breakdown: { inventory: number; expenses: number; total: number };
  optimization_tips: string[];
  risk_factors: string[];
}

type ForecastType = 'revenue' | 'inventory' | 'profit';

export default function Forecasting() {
  const [forecastType, setForecastType] = useState<ForecastType>('revenue');
  const [loading, setLoading] = useState(false);
  const [revenueForecast, setRevenueForecast] = useState<RevenueForecast | null>(null);
  const [inventoryForecast, setInventoryForecast] = useState<InventoryForecast | null>(null);
  const [profitForecast, setProfitForecast] = useState<ProfitForecast | null>(null);

  const generateForecast = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-forecast', {
        body: { type: forecastType, months: 3 },
      });

      if (error) throw error;

      if (forecastType === 'revenue') {
        setRevenueForecast(data.forecast);
      } else if (forecastType === 'inventory') {
        setInventoryForecast(data.forecast);
      } else {
        setProfitForecast(data.forecast);
      }

      toast.success('Forecast generated successfully!');
    } catch (error) {
      console.error('Forecast error:', error);
      toast.error('Failed to generate forecast. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'growing') return <ArrowUpRight className="h-4 w-4 text-success" />;
    if (trend === 'declining') return <ArrowDownRight className="h-4 w-4 text-destructive" />;
    return <TrendingUp className="h-4 w-4 text-warning" />;
  };

  const getConfidenceColor = (confidence: string) => {
    if (confidence === 'high') return 'text-success';
    if (confidence === 'medium') return 'text-warning';
    return 'text-muted-foreground';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text flex items-center gap-3">
              <Brain className="h-8 w-8" />
              AI Forecasting
            </h1>
            <p className="text-muted-foreground mt-1">
              Predict revenue, inventory needs, and profit trends using AI
            </p>
          </div>
        </div>

        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">Forecast Type</label>
                <Select value={forecastType} onValueChange={(v) => setForecastType(v as ForecastType)}>
                  <SelectTrigger className="w-full md:w-[300px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="revenue">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        Revenue Forecast
                      </div>
                    </SelectItem>
                    <SelectItem value="inventory">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-secondary" />
                        Inventory Recommendations
                      </div>
                    </SelectItem>
                    <SelectItem value="profit">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-success" />
                        Profit Analysis
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={generateForecast} 
                disabled={loading}
                className="gradient-primary"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Forecast
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Revenue Forecast Results */}
        {forecastType === 'revenue' && revenueForecast && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Revenue Predictions
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  Trend: {revenueForecast.trend} {getTrendIcon(revenueForecast.trend)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueForecast.forecast} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(220, 100%, 60%)" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="hsl(220, 100%, 60%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 15%, 18%)" />
                      <XAxis dataKey="month" stroke="hsl(240, 10%, 55%)" />
                      <YAxis stroke="hsl(240, 10%, 55%)" tickFormatter={(val) => `$${val / 1000}k`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(240, 15%, 9%)',
                          border: '1px solid hsl(240, 15%, 18%)',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Area
                        type="monotone"
                        dataKey="predicted_revenue"
                        stroke="hsl(220, 100%, 60%)"
                        fillOpacity={1}
                        fill="url(#colorPredicted)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-2">
                  {revenueForecast.forecast.map((f) => (
                    <div key={f.month} className="flex justify-between items-center p-2 rounded-lg bg-muted/30">
                      <span>{f.month}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{formatCurrency(f.predicted_revenue)}</span>
                        <span className={`text-xs ${getConfidenceColor(f.confidence)}`}>
                          {f.confidence} confidence
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="font-display">AI Insights & Recommendations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Key Insights
                  </h4>
                  <ul className="space-y-2">
                    {revenueForecast.insights.map((insight, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-success mt-0.5 shrink-0" />
                        {insight}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-accent" />
                    Recommendations
                  </h4>
                  <ul className="space-y-2">
                    {revenueForecast.recommendations.map((rec, i) => (
                      <li key={i} className="text-sm p-2 rounded-lg bg-primary/10 text-primary">
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Inventory Forecast Results */}
        {forecastType === 'inventory' && inventoryForecast && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Package className="h-5 w-5 text-secondary" />
                  Stock Recommendations
                </CardTitle>
                <CardDescription>
                  Optimal stock level: {inventoryForecast.optimal_stock_level} units
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {inventoryForecast.recommendations.map((rec, i) => (
                    <div key={i} className="p-3 rounded-lg bg-muted/30">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">{rec.brand}</span>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            rec.action === 'restock'
                              ? 'bg-success/10 text-success'
                              : rec.action === 'reduce'
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {rec.action.toUpperCase()} ({rec.quantity})
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{rec.reason}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Alerts & Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {inventoryForecast.alerts.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Alerts</h4>
                    <div className="space-y-2">
                      {inventoryForecast.alerts.map((alert, i) => (
                        <div
                          key={i}
                          className={`p-3 rounded-lg ${
                            alert.type === 'low_stock'
                              ? 'bg-destructive/10 border border-destructive/20'
                              : alert.type === 'high_demand'
                              ? 'bg-success/10 border border-success/20'
                              : 'bg-warning/10 border border-warning/20'
                          }`}
                        >
                          <p className="text-sm">{alert.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="font-medium mb-2">Insights</h4>
                  <ul className="space-y-2">
                    {inventoryForecast.insights.map((insight, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Profit Forecast Results */}
        {forecastType === 'profit' && profitForecast && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-success" />
                  Profit Predictions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 mb-4">
                  {profitForecast.profit_forecast.map((f) => (
                    <div key={f.month} className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                      <span>{f.month}</span>
                      <div className="text-right">
                        <p className="font-semibold text-success">{formatCurrency(f.predicted_profit)}</p>
                        <p className="text-xs text-muted-foreground">{f.margin_percentage.toFixed(1)}% margin</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border pt-4">
                  <h4 className="font-medium mb-3">Cost Breakdown</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Inventory Costs</span>
                      <span>{formatCurrency(profitForecast.cost_breakdown.inventory)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Operating Expenses</span>
                      <span>{formatCurrency(profitForecast.cost_breakdown.expenses)}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t border-border pt-2">
                      <span>Total</span>
                      <span className="text-destructive">{formatCurrency(profitForecast.cost_breakdown.total)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="font-display">Optimization & Risks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-success" />
                    Optimization Tips
                  </h4>
                  <ul className="space-y-2">
                    {profitForecast.optimization_tips.map((tip, i) => (
                      <li key={i} className="text-sm p-2 rounded-lg bg-success/10 text-success">
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    Risk Factors
                  </h4>
                  <ul className="space-y-2">
                    {profitForecast.risk_factors.map((risk, i) => (
                      <li key={i} className="text-sm p-2 rounded-lg bg-warning/10 text-warning">
                        {risk}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empty State */}
        {!loading && !revenueForecast && !inventoryForecast && !profitForecast && (
          <Card className="border-border/50 border-dashed">
            <CardContent className="py-12 text-center">
              <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Forecast Generated Yet</h3>
              <p className="text-muted-foreground mb-4">
                Select a forecast type and click "Generate Forecast" to get AI-powered predictions
              </p>
              <Button onClick={generateForecast} className="gradient-primary">
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Your First Forecast
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
