-- Trades & Deals: cada relógio fica Inegociável, À venda ou Recebendo propostas (e pode aceitar troca),
-- com preço médio de mercado calculado pelo agente de preços.

alter table watches drop constraint watches_sale_mode_check;
alter table watches add column accepts_trade boolean not null default false;

-- Converte os modos antigos: "troca" vira "recebendo propostas + aceita troca"; "venda ou troca" vira "à venda + aceita troca"
update watches set accepts_trade = true where sale_mode in ('trade', 'sale_or_trade');
update watches set sale_mode = 'offers' where sale_mode = 'trade';
update watches set sale_mode = 'sale' where sale_mode = 'sale_or_trade';

-- none = Inegociável, sale = À venda, offers = Recebendo propostas
alter table watches add constraint watches_sale_mode_check check (sale_mode in ('none', 'sale', 'offers'));

-- Preço médio de mercado (preenchido só pelo agente de preços; o usuário não grava esses campos)
alter table watches add column market_status text check (market_status in ('pending', 'working', 'done', 'failed'));
alter table watches add column market_price integer;              -- preço médio em reais
alter table watches add column market_min integer;
alter table watches add column market_max integer;
alter table watches add column market_confidence text;            -- alta, media, baixa
alter table watches add column market_note text;
alter table watches add column market_sources jsonb;              -- [{title, store, price, link}]
alter table watches add column market_checked_at timestamptz;
alter table watches add column market_attempts integer not null default 0;
alter table watches add column market_started_at timestamptz;
alter table watches add column market_error text;
create index watches_market_pending_idx on watches(market_status) where market_status in ('pending', 'working');
