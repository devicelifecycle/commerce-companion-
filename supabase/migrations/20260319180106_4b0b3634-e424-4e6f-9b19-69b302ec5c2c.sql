
CREATE OR REPLACE FUNCTION public.calculate_sale_profit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    device_cost DECIMAL(10, 2);
BEGIN
    -- Get the cost price: device cost or manual cost override
    IF NEW.device_id IS NOT NULL THEN
        SELECT cost_price INTO device_cost
        FROM public.devices
        WHERE id = NEW.device_id;
    ELSE
        device_cost := COALESCE(NEW.manual_cost, 0);
    END IF;
    
    -- Calculate profit: sale_price - cost - shipping - fees - tax
    NEW.profit := NEW.sale_price - COALESCE(device_cost, 0) - COALESCE(NEW.shipping_cost, 0) - COALESCE(NEW.marketplace_fees, 0) - COALESCE(NEW.tax_amount, 0);
    
    RETURN NEW;
END;
$function$;
