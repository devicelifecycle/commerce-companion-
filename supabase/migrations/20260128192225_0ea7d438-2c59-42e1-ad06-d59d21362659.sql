-- Create enum for device condition
CREATE TYPE public.device_condition AS ENUM ('new', 'refurbished', 'used', 'damaged');

-- Create enum for device status
CREATE TYPE public.device_status AS ENUM ('in_stock', 'reserved', 'sold', 'returned');

-- Create enum for marketplace
CREATE TYPE public.marketplace AS ENUM ('shopify', 'amazon', 'bestbuy', 'other');

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'viewer');

-- Create profiles table for user data
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name TEXT,
    email TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table for role management
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Create suppliers table
CREATE TABLE public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create devices table (main inventory)
CREATE TABLE public.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    imei TEXT UNIQUE,
    model TEXT NOT NULL,
    brand TEXT NOT NULL,
    storage TEXT,
    color TEXT,
    condition device_condition NOT NULL DEFAULT 'new',
    status device_status NOT NULL DEFAULT 'in_stock',
    cost_price DECIMAL(10, 2) NOT NULL,
    sale_price DECIMAL(10, 2),
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    purchase_date DATE DEFAULT CURRENT_DATE,
    warehouse_location TEXT,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sales/orders table
CREATE TABLE public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
    order_number TEXT NOT NULL,
    marketplace marketplace NOT NULL,
    sale_price DECIMAL(10, 2) NOT NULL,
    shipping_cost DECIMAL(10, 2) DEFAULT 0,
    marketplace_fees DECIMAL(10, 2) DEFAULT 0,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    profit DECIMAL(10, 2),
    sale_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    customer_name TEXT,
    customer_email TEXT,
    shipping_address TEXT,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create import batches table to track Excel imports
CREATE TABLE public.import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name TEXT NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    successful_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0,
    imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
    )
$$;

-- Create function to check if user has any role (authenticated team member)
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
    )
$$;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- User roles policies - admins can manage, users can view own
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Suppliers policies - team members can view and manage
CREATE POLICY "Team members can view suppliers"
ON public.suppliers FOR SELECT
USING (public.is_team_member(auth.uid()));

CREATE POLICY "Admins and managers can manage suppliers"
ON public.suppliers FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Devices policies - team members can view, admins/managers can manage
CREATE POLICY "Team members can view devices"
ON public.devices FOR SELECT
USING (public.is_team_member(auth.uid()));

CREATE POLICY "Admins and managers can insert devices"
ON public.devices FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins and managers can update devices"
ON public.devices FOR UPDATE
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins can delete devices"
ON public.devices FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Sales policies - team members can view, admins/managers can manage
CREATE POLICY "Team members can view sales"
ON public.sales FOR SELECT
USING (public.is_team_member(auth.uid()));

CREATE POLICY "Admins and managers can manage sales"
ON public.sales FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Import batches policies
CREATE POLICY "Team members can view import batches"
ON public.import_batches FOR SELECT
USING (public.is_team_member(auth.uid()));

CREATE POLICY "Admins and managers can create import batches"
ON public.import_batches FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Create function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, email, full_name)
    VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_suppliers_updated_at
    BEFORE UPDATE ON public.suppliers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_devices_updated_at
    BEFORE UPDATE ON public.devices
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sales_updated_at
    BEFORE UPDATE ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to calculate profit on sales
CREATE OR REPLACE FUNCTION public.calculate_sale_profit()
RETURNS TRIGGER AS $$
DECLARE
    device_cost DECIMAL(10, 2);
BEGIN
    -- Get the cost price of the device
    SELECT cost_price INTO device_cost
    FROM public.devices
    WHERE id = NEW.device_id;
    
    -- Calculate profit: sale_price - cost - shipping - fees - tax
    NEW.profit := NEW.sale_price - COALESCE(device_cost, 0) - COALESCE(NEW.shipping_cost, 0) - COALESCE(NEW.marketplace_fees, 0) - COALESCE(NEW.tax_amount, 0);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger to auto-calculate profit
CREATE TRIGGER calculate_profit_on_sale
    BEFORE INSERT OR UPDATE ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_sale_profit();

-- Create function to update device status when sold
CREATE OR REPLACE FUNCTION public.update_device_on_sale()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.devices
    SET status = 'sold', sale_price = NEW.sale_price, updated_at = now()
    WHERE id = NEW.device_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger to update device status on sale
CREATE TRIGGER update_device_status_on_sale
    AFTER INSERT ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.update_device_on_sale();