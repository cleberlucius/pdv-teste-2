import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Settings, 
  ShoppingCart, 
  RotateCcw, 
  BarChart3, 
  Trash2, 
  Plus, 
  Minus, 
  X, 
  CreditCard, 
  Banknote, 
  QrCode, 
  User, 
  CheckCircle2, 
  Search,
  Printer,
  History
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line 
} from "recharts";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Flavor {
  nome: string;
  preco: number;
}

interface Config {
  troco_inicial: number;
  sabores_fixos: Flavor[];
  sabores_sazonais: Flavor[];
}

interface CartItem {
  id: string;
  nome: string;
  preco: number;
  quantidade: number;
}

interface Venda {
  id: number;
  timestamp: string;
  itens: string; // JSON string
  total: number;
  metodo_pagamento: string;
  troco: number;
  status: string;
}

interface VIP {
  id: number;
  nome: string;
  total_acumulado: number;
}

const PRECO_PADRAO = 10.0; // Preço padrão para os sabores

export default function App() {
  const [activeTab, setActiveTab] = useState<"config" | "vendas" | "estorno" | "fechamento" | "backup">("config");
  const [config, setConfig] = useState<Config>({
    troco_inicial: 0,
    sabores_fixos: [
      { nome: "Pilsen", preco: 10 },
      { nome: "IPA", preco: 10 },
      { nome: "Black Jack", preco: 10 },
      { nome: "Vinho", preco: 10 },
      { nome: "Manga", preco: 10 },
      { nome: "Morango", preco: 10 }
    ],
    sabores_sazonais: []
  });
  const [sazonaisInput, setSazonaisInput] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [vips, setVips] = useState<VIP[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchId, setSearchId] = useState("");
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; method?: string; value?: number; change?: number; vipName?: string }>({ open: false });
  const [ticketData, setTicketData] = useState<{ id: number; flavor: string } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [configRes, vendasRes, vipsRes] = await Promise.all([
        fetch("/api/config"),
        fetch("/api/vendas"),
        fetch("/api/vips")
      ]);
      const configData = await configRes.json();
      const vendasData = await vendasRes.json();
      const vipsData = await vipsRes.json();

      const safeParse = (data: any, fallback: any) => {
        if (!data) return fallback;
        try {
          const parsed = JSON.parse(data);
          return Array.isArray(parsed) ? parsed : fallback;
        } catch (e) {
          // If it's a string but not JSON, it might be the old comma-separated format
          if (typeof data === "string" && data.trim() !== "") {
            return data.split(",").map(s => s.trim()).filter(s => s !== "").map(s => ({ nome: s, preco: PRECO_PADRAO }));
          }
          return fallback;
        }
      };

      const fixosParsed = safeParse(configData.sabores_fixos, []);
      const sazonaisParsed = safeParse(configData.sabores_sazonais, []);

      setConfig({
        ...configData,
        sabores_fixos: fixosParsed,
        sabores_sazonais: sazonaisParsed
      });
      setSazonaisInput(sazonaisParsed.map((f: Flavor) => f.nome).join(", "));
      setVendas(vendasData);
      setVips(vipsData);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
    }
  };

  const saveConfig = async (newConfig: Config) => {
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig)
      });
      setConfig(newConfig);
      alert("Configuração salva com sucesso!");
    } catch (error) {
      console.error("Error saving config:", error);
    }
  };

  const addToCart = (flavor: Flavor) => {
    setCart(prev => {
      const existing = prev.find(item => item.nome === flavor.nome);
      if (existing) {
        return prev.map(item => item.nome === flavor.nome ? { ...item, quantidade: item.quantidade + 1 } : item);
      }
      return [...prev, { id: Date.now().toString(), nome: flavor.nome, preco: flavor.preco, quantidade: 1 }];
    });
  };

  const updateCartQuantity = (nome: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.nome === nome) {
          const newQty = Math.max(0, item.quantidade + delta);
          return { ...item, quantidade: newQty };
        }
        return item;
      }).filter(item => item.quantidade > 0);
    });
  };

  const removeFromCart = (nome: string) => {
    setCart(prev => prev.filter(item => item.nome !== nome));
  };

  const totalCart = useMemo(() => cart.reduce((acc, item) => acc + item.preco * item.quantidade, 0), [cart]);

  const finalizeSale = async (method: string, extra: { cashValue?: number; vipName?: string } = {}) => {
    const change = method === "Dinheiro" && extra.cashValue ? extra.cashValue - totalCart : 0;
    
    try {
      const res = await fetch("/api/vendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itens: cart,
          total: totalCart,
          metodo_pagamento: method,
          troco: change,
          vip_nome: extra.vipName
        })
      });
      const data = await res.json();
      
      if (data.success) {
        // Generate tickets for each item
        const lastItem = cart[cart.length - 1];
        setTicketData({ id: data.vendaId, flavor: lastItem.nome });
        
        setCart([]);
        setPaymentModal({ open: false });
        fetchInitialData();
      }
    } catch (error) {
      console.error("Error finalizing sale:", error);
    }
  };

  const handleRefund = async (id: number, itemIndex?: number) => {
    if (!confirm("Deseja realmente realizar este estorno?")) return;
    try {
      await fetch("/api/vendas/estorno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, item_index: itemIndex })
      });
      fetchInitialData();
    } catch (error) {
      console.error("Error refunding:", error);
    }
  };

  const resetSystem = async () => {
    if (!confirm("Deseja realmente ZERAR o sistema? Todos os dados serão perdidos.")) return;
    try {
      await fetch("/api/reset", { method: "POST" });
      fetchInitialData();
      setCart([]);
      alert("Sistema zerado com sucesso!");
    } catch (error) {
      console.error("Error resetting system:", error);
    }
  };

  const generateTicketImage = (vendaId: number, flavor: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and set background
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 300, 400);

    // Border
    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, 290, 390);

    // Logo Placeholder
    ctx.fillStyle = "black";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SEVEN DWARFS", 150, 40);
    ctx.font = "12px sans-serif";
    ctx.fillText("A verdadeira delícia gelada", 150, 60);

    // Divider
    ctx.beginPath();
    ctx.moveTo(20, 80);
    ctx.lineTo(280, 80);
    ctx.stroke();

    // Flavor
    ctx.font = "bold 32px sans-serif";
    ctx.fillText(flavor.toUpperCase(), 150, 180);

    // ID
    ctx.font = "14px sans-serif";
    ctx.fillText(`ID da Venda: #${vendaId}`, 150, 250);

    // Footer
    ctx.font = "10px sans-serif";
    ctx.fillText("Válido apenas na data de emissão", 150, 320);
    ctx.fillText("durante a duração do evento", 150, 335);
    ctx.fillText("Seven Dwarfs a verdadeira delícia gelada", 150, 355);
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("BEBA COM MODERAÇÃO", 150, 380);

    // Download or Print
    const link = document.createElement('a');
    link.download = `ticket-${vendaId}-${flavor}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const allFlavors = useMemo(() => {
    return [...config.sabores_fixos, ...config.sabores_sazonais];
  }, [config]);

  const processSazonais = () => {
    const names = sazonaisInput.split(",").map(s => s.trim()).filter(s => s !== "");
    const next = names.map(name => {
      const existing = config.sabores_sazonais.find(f => f.nome === name);
      return existing || { nome: name, preco: PRECO_PADRAO };
    });
    setConfig({ ...config, sabores_sazonais: next });
  };

  const filteredVendas = useMemo(() => {
    if (!searchId) return vendas;
    return vendas.filter(v => v.id.toString().includes(searchId));
  }, [vendas, searchId]);

  const stats = useMemo(() => {
    const paidVendas = vendas.filter(v => v.status === "pago");
    const faturamento = paidVendas.reduce((acc, v) => acc + v.total, 0);
    const gaveta = faturamento + config.troco_inicial;
    
    const salesByFlavor: Record<string, number> = {};
    const salesByHour: Record<string, number> = {};

    paidVendas.forEach(v => {
      const itens = JSON.parse(v.itens);
      itens.forEach((item: any) => {
        salesByFlavor[item.nome] = (salesByFlavor[item.nome] || 0) + item.quantidade;
      });

      const hour = new Date(v.timestamp).getHours();
      salesByHour[`${hour}h`] = (salesByHour[`${hour}h`] || 0) + v.total;
    });

    const flavorData = Object.entries(salesByFlavor).map(([name, value]) => ({ name, value }));
    const hourData = Object.entries(salesByHour).map(([hour, value]) => ({ hour, value }));

    return { faturamento, gaveta, flavorData, hourData };
  }, [vendas, config.troco_inicial]);

  if (loading) return <div className="flex items-center justify-center h-screen">Carregando...</div>;

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans">
      {/* Sidebar / Navigation */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-black/5 flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-bold">7</div>
          <h1 className="text-xl font-bold tracking-tight">SEVEN DWARFS</h1>
        </div>
        <div className="flex gap-4">
          {[
            { id: "config", icon: Settings, label: "Config" },
            { id: "vendas", icon: ShoppingCart, label: "Vendas" },
            { id: "estorno", icon: RotateCcw, label: "Estorno" },
            { id: "fechamento", icon: BarChart3, label: "Fechamento" },
            { id: "backup", icon: Trash2, label: "Backup" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full transition-all",
                activeTab === tab.id ? "bg-black text-white" : "hover:bg-black/5"
              )}
            >
              <tab.icon size={18} />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className="pt-24 pb-12 px-6 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === "config" && (
            <motion.div
              key="config"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-8"
            >
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-black/5">
                <h2 className="text-2xl font-bold mb-6">Configuração do Evento</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-black/60 mb-2 uppercase tracking-wider">Troco Inicial (R$)</label>
                    <input
                      type="number"
                      value={config.troco_inicial}
                      onChange={e => setConfig({ ...config, troco_inicial: parseFloat(e.target.value) || 0 })}
                      className="w-full p-4 bg-[#F9F9F9] rounded-2xl border-none focus:ring-2 focus:ring-black outline-none text-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-black/60 mb-2 uppercase tracking-wider">Sabores Fixos</label>
                    <div className="flex flex-wrap gap-2">
                      {["Pilsen", "IPA", "Black Jack", "Vinho", "Manga", "Morango"].map(sabor => {
                        const isSelected = config.sabores_fixos.some(f => f.nome === sabor);
                        return (
                          <button
                            key={sabor}
                            onClick={() => {
                              const next = isSelected 
                                ? config.sabores_fixos.filter(f => f.nome !== sabor) 
                                : [...config.sabores_fixos, { nome: sabor, preco: PRECO_PADRAO }];
                              setConfig({ ...config, sabores_fixos: next });
                            }}
                            className={cn(
                              "px-4 py-2 rounded-full border transition-all",
                              isSelected ? "bg-black text-white border-black" : "bg-white border-black/10 hover:border-black/30"
                            )}
                          >
                            {sabor}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {config.sabores_fixos.length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-black/40 uppercase tracking-widest">Ajustar Preços dos Fixos</label>
                      {config.sabores_fixos.map(f => (
                        <div key={f.nome} className="flex items-center justify-between gap-4 bg-[#F9F9F9] p-3 rounded-xl">
                          <span className="text-sm font-medium">{f.nome}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-black/40">R$</span>
                            <input
                              type="number"
                              value={f.preco}
                              onChange={e => {
                                const next = config.sabores_fixos.map(item => 
                                  item.nome === f.nome ? { ...item, preco: parseFloat(e.target.value) || 0 } : item
                                );
                                setConfig({ ...config, sabores_fixos: next });
                              }}
                              className="w-20 p-1 bg-white rounded border border-black/5 text-right font-mono text-sm"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-black/60 mb-2 uppercase tracking-wider">Sabores Sazonais (separados por vírgula)</label>
                    <div className="flex gap-2 mb-2">
                      <textarea
                        value={sazonaisInput}
                        onChange={e => setSazonaisInput(e.target.value)}
                        placeholder="Ex: Doce de Leite, Pistache, Maracujá"
                        className="flex-1 p-4 bg-[#F9F9F9] rounded-2xl border-none focus:ring-2 focus:ring-black outline-none h-24 resize-none"
                      />
                      <button
                        onClick={processSazonais}
                        className="px-4 bg-black text-white rounded-2xl hover:bg-black/80 transition-all flex flex-col items-center justify-center gap-1"
                      >
                        <Settings size={18} />
                        <span className="text-[10px] font-bold uppercase">Configurar Preços</span>
                      </button>
                    </div>
                  </div>
                  {config.sabores_sazonais.length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-black/40 uppercase tracking-widest">Ajustar Preços dos Sazonais</label>
                      {config.sabores_sazonais.map(f => (
                        <div key={f.nome} className="flex items-center justify-between gap-4 bg-[#F9F9F9] p-3 rounded-xl">
                          <span className="text-sm font-medium">{f.nome}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-black/40">R$</span>
                            <input
                              type="number"
                              value={f.preco}
                              onChange={e => {
                                const next = config.sabores_sazonais.map(item => 
                                  item.nome === f.nome ? { ...item, preco: parseFloat(e.target.value) || 0 } : item
                                );
                                setConfig({ ...config, sabores_sazonais: next });
                              }}
                              className="w-20 p-1 bg-white rounded border border-black/5 text-right font-mono text-sm"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => saveConfig(config)}
                    className="w-full py-4 bg-black text-white rounded-2xl font-bold hover:bg-black/90 transition-all"
                  >
                    Salvar Configurações
                  </button>
                </div>
              </div>
              <div className="bg-black text-white p-8 rounded-3xl shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-bold mb-2">Resumo do Cardápio</h3>
                  <p className="text-white/60 text-sm mb-6">Estes serão os sabores disponíveis na tela de vendas.</p>
                  <div className="space-y-2">
                    {allFlavors.length > 0 ? allFlavors.map(s => (
                      <div key={s.nome} className="flex justify-between items-center py-2 border-b border-white/10">
                        <span>{s.nome}</span>
                        <span className="font-mono text-white/60">R$ {s.preco.toFixed(2)}</span>
                      </div>
                    )) : <p className="text-white/40 italic">Nenhum sabor configurado.</p>}
                  </div>
                </div>
                <div className="mt-8 pt-8 border-t border-white/10">
                  <div className="flex justify-between items-center">
                    <span className="text-white/60 uppercase tracking-widest text-xs">Troco em Caixa</span>
                    <span className="text-3xl font-mono">R$ {config.troco_inicial.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "vendas" && (
            <motion.div
              key="vendas"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-12rem)]"
            >
              {/* Left Column: Flavors & VIPs */}
              <div className="lg:col-span-2 flex flex-col gap-8 overflow-hidden">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5 flex-1 overflow-y-auto">
                  <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Plus size={20} /> Selecione os Sabores
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {allFlavors.map(sabor => (
                      <button
                        key={sabor.nome}
                        onClick={() => addToCart(sabor)}
                        className="h-32 bg-[#F9F9F9] rounded-2xl border border-black/5 hover:border-black/20 hover:bg-white transition-all flex flex-col items-center justify-center gap-2 group"
                      >
                        <span className="text-lg font-bold group-hover:scale-110 transition-transform">{sabor.nome}</span>
                        <span className="text-xs text-black/40 font-mono">R$ {sabor.preco.toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5 h-48 overflow-y-auto">
                  <h2 className="text-sm font-bold text-black/40 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <User size={14} /> Contas VIP Abertas
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {vips.length > 0 ? vips.map(vip => (
                      <div key={vip.id} className="px-4 py-2 bg-black/5 rounded-full flex items-center gap-3">
                        <span className="font-medium">{vip.nome}</span>
                        <span className="text-xs font-mono text-black/40">R$ {vip.total_acumulado.toFixed(2)}</span>
                      </div>
                    )) : <p className="text-black/30 text-sm italic">Nenhuma conta VIP registrada.</p>}
                  </div>
                </div>
              </div>

              {/* Right Column: Cart */}
              <div className="bg-white rounded-3xl shadow-xl border border-black/5 flex flex-col overflow-hidden">
                <div className="p-6 border-b border-black/5 flex justify-between items-center">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <ShoppingCart size={20} /> Carrinho
                  </h2>
                  <button onClick={() => setCart([])} className="text-black/40 hover:text-red-500 transition-colors">
                    <Trash2 size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {cart.length > 0 ? cart.map(item => (
                    <div key={item.nome} className="flex items-center justify-between p-4 bg-[#F9F9F9] rounded-2xl">
                      <div>
                        <h4 className="font-bold">{item.nome}</h4>
                        <p className="text-xs text-black/40 font-mono">R$ {item.preco.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => updateCartQuantity(item.nome, -1)} className="w-8 h-8 rounded-full bg-white border border-black/5 flex items-center justify-center hover:bg-black hover:text-white transition-all">
                          <Minus size={14} />
                        </button>
                        <span className="font-mono font-bold w-4 text-center">{item.quantidade}</span>
                        <button onClick={() => updateCartQuantity(item.nome, 1)} className="w-8 h-8 rounded-full bg-white border border-black/5 flex items-center justify-center hover:bg-black hover:text-white transition-all">
                          <Plus size={14} />
                        </button>
                        <button onClick={() => removeFromCart(item.nome)} className="ml-2 text-black/20 hover:text-red-500">
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div className="h-full flex flex-col items-center justify-center text-black/20 gap-4">
                      <ShoppingCart size={48} />
                      <p className="font-medium">Carrinho vazio</p>
                    </div>
                  )}
                </div>

                <div className="p-6 bg-black text-white">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-white/60 uppercase tracking-widest text-xs">Total a Pagar</span>
                    <span className="text-3xl font-mono font-bold">R$ {totalCart.toFixed(2)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      disabled={cart.length === 0}
                      onClick={() => setPaymentModal({ open: true, method: "PIX" })}
                      className="flex items-center justify-center gap-2 py-3 bg-white/10 rounded-xl hover:bg-white/20 transition-all disabled:opacity-50"
                    >
                      <QrCode size={18} /> PIX
                    </button>
                    <button 
                      disabled={cart.length === 0}
                      onClick={() => setPaymentModal({ open: true, method: "Cartão" })}
                      className="flex items-center justify-center gap-2 py-3 bg-white/10 rounded-xl hover:bg-white/20 transition-all disabled:opacity-50"
                    >
                      <CreditCard size={18} /> Cartão
                    </button>
                    <button 
                      disabled={cart.length === 0}
                      onClick={() => setPaymentModal({ open: true, method: "Dinheiro" })}
                      className="flex items-center justify-center gap-2 py-3 bg-white/10 rounded-xl hover:bg-white/20 transition-all disabled:opacity-50"
                    >
                      <Banknote size={18} /> Dinheiro
                    </button>
                    <button 
                      disabled={cart.length === 0}
                      onClick={() => setPaymentModal({ open: true, method: "VIP" })}
                      className="flex items-center justify-center gap-2 py-3 bg-white/10 rounded-xl hover:bg-white/20 transition-all disabled:opacity-50"
                    >
                      <User size={18} /> VIP
                    </button>
                  </div>
                  <button 
                    disabled={cart.length === 0}
                    onClick={() => finalizeSale("Cortesia")}
                    className="w-full mt-3 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all disabled:opacity-50"
                  >
                    Cortesia
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "estorno" && (
            <motion.div
              key="estorno"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white p-8 rounded-3xl shadow-sm border border-black/5"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold">Gerenciamento de Estornos</h2>
                <div className="relative w-64">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40" size={18} />
                  <input
                    type="text"
                    placeholder="Buscar por ID..."
                    value={searchId}
                    onChange={e => setSearchId(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-[#F9F9F9] rounded-2xl border-none focus:ring-2 focus:ring-black outline-none"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-black/40 text-xs uppercase tracking-widest border-b border-black/5">
                      <th className="pb-4 px-4">ID</th>
                      <th className="pb-4 px-4">Data/Hora</th>
                      <th className="pb-4 px-4">Itens</th>
                      <th className="pb-4 px-4">Total</th>
                      <th className="pb-4 px-4">Pagamento</th>
                      <th className="pb-4 px-4">Status</th>
                      <th className="pb-4 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {filteredVendas.map(venda => {
                      const itens = JSON.parse(venda.itens);
                      return (
                        <tr key={venda.id} className="group hover:bg-black/[0.02] transition-colors">
                          <td className="py-4 px-4 font-mono font-bold">#{venda.id}</td>
                          <td className="py-4 px-4 text-sm text-black/60">{new Date(venda.timestamp).toLocaleString()}</td>
                          <td className="py-4 px-4">
                            <div className="flex flex-wrap gap-1">
                              {itens.map((it: any, idx: number) => (
                                <span key={idx} className="text-xs bg-black/5 px-2 py-1 rounded-md">
                                  {it.quantidade}x {it.nome}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-4 px-4 font-mono">R$ {venda.total.toFixed(2)}</td>
                          <td className="py-4 px-4">
                            <span className="text-xs font-medium px-2 py-1 bg-black text-white rounded-full">{venda.metodo_pagamento}</span>
                          </td>
                          <td className="py-4 px-4">
                            <span className={cn(
                              "text-xs font-bold uppercase tracking-tighter",
                              venda.status === "pago" ? "text-emerald-500" : "text-red-500"
                            )}>
                              {venda.status}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right">
                            {venda.status === "pago" && (
                              <button
                                onClick={() => handleRefund(venda.id)}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                title="Estornar Venda Total"
                              >
                                <RotateCcw size={18} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === "fechamento" && (
            <motion.div
              key="fechamento"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-black/5">
                  <p className="text-black/40 text-xs uppercase tracking-widest mb-2">Faturamento Total</p>
                  <p className="text-4xl font-mono font-bold">R$ {stats.faturamento.toFixed(2)}</p>
                </div>
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-black/5">
                  <p className="text-black/40 text-xs uppercase tracking-widest mb-2">Troco em Caixa</p>
                  <p className="text-4xl font-mono font-bold text-black/40">R$ {config.troco_inicial.toFixed(2)}</p>
                </div>
                <div className="bg-black text-white p-8 rounded-3xl shadow-xl">
                  <p className="text-white/60 text-xs uppercase tracking-widest mb-2">Total na Gaveta</p>
                  <p className="text-4xl font-mono font-bold">R$ {stats.gaveta.toFixed(2)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-black/5">
                  <h3 className="text-xl font-bold mb-8 flex items-center gap-2">
                    <BarChart3 size={20} /> Vendas por Sabor
                  </h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.flavorData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="value" fill="#000" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-3xl shadow-sm border border-black/5">
                  <h3 className="text-xl font-bold mb-8 flex items-center gap-2">
                    <History size={20} /> Faturamento por Hora
                  </h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stats.hourData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                        <XAxis dataKey="hour" axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Line type="monotone" dataKey="value" stroke="#000" strokeWidth={3} dot={{ r: 6, fill: '#000' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "backup" && (
            <motion.div
              key="backup"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl mx-auto bg-white p-12 rounded-[3rem] shadow-2xl border border-black/5 text-center"
            >
              <div className="w-24 h-24 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-8">
                <Trash2 size={48} />
              </div>
              <h2 className="text-3xl font-bold mb-4">Zerar Sistema</h2>
              <p className="text-black/60 mb-12 leading-relaxed">
                Esta ação irá apagar permanentemente todas as vendas, contas VIP e configurações atuais. 
                Os arquivos de backup CSV também serão removidos. Esta ação não pode ser desfeita.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setActiveTab("vendas")}
                  className="py-4 bg-[#F9F9F9] rounded-2xl font-bold hover:bg-black/5 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={resetSystem}
                  className="py-4 bg-red-500 text-white rounded-2xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-200"
                >
                  Confirmar Reset
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Payment Modal */}
      <AnimatePresence>
        {paymentModal.open && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPaymentModal({ open: false })}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-bold">Pagamento: {paymentModal.method}</h3>
                  <button onClick={() => setPaymentModal({ open: false })} className="text-black/20 hover:text-black">
                    <X size={24} />
                  </button>
                </div>

                <div className="bg-[#F9F9F9] p-6 rounded-3xl mb-8">
                  <p className="text-black/40 text-xs uppercase tracking-widest mb-1">Valor Total</p>
                  <p className="text-4xl font-mono font-bold">R$ {totalCart.toFixed(2)}</p>
                </div>

                {paymentModal.method === "Dinheiro" && (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-black/60 mb-2 uppercase tracking-wider">Valor Recebido</label>
                      <input
                        type="number"
                        autoFocus
                        onChange={e => setPaymentModal({ ...paymentModal, value: parseFloat(e.target.value) || 0 })}
                        className="w-full p-4 bg-[#F9F9F9] rounded-2xl border-none focus:ring-2 focus:ring-black outline-none text-2xl font-mono"
                      />
                    </div>
                    {paymentModal.value && paymentModal.value >= totalCart && (
                      <div className="p-6 bg-emerald-50 text-emerald-700 rounded-3xl">
                        <p className="text-xs uppercase tracking-widest mb-1">Troco</p>
                        <p className="text-3xl font-mono font-bold">R$ {(paymentModal.value - totalCart).toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                )}

                {paymentModal.method === "VIP" && (
                  <div>
                    <label className="block text-sm font-medium text-black/60 mb-2 uppercase tracking-wider">Nome do Cliente VIP</label>
                    <input
                      type="text"
                      autoFocus
                      onChange={e => setPaymentModal({ ...paymentModal, vipName: e.target.value })}
                      className="w-full p-4 bg-[#F9F9F9] rounded-2xl border-none focus:ring-2 focus:ring-black outline-none text-xl"
                      placeholder="Ex: João Silva"
                    />
                  </div>
                )}

                <button
                  onClick={() => finalizeSale(paymentModal.method!, { cashValue: paymentModal.value, vipName: paymentModal.vipName })}
                  disabled={
                    (paymentModal.method === "Dinheiro" && (!paymentModal.value || paymentModal.value < totalCart)) ||
                    (paymentModal.method === "VIP" && !paymentModal.vipName)
                  }
                  className="w-full mt-8 py-4 bg-black text-white rounded-2xl font-bold hover:bg-black/90 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={20} /> Confirmar Pagamento
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Ticket Download UI */}
      {ticketData && (
        <div className="fixed bottom-8 right-8 z-[110]">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white p-6 rounded-3xl shadow-2xl border border-black/5 flex items-center gap-6"
          >
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
              <Printer size={24} />
            </div>
            <div>
              <h4 className="font-bold">Venda #{ticketData.id}</h4>
              <p className="text-sm text-black/40">Gere a ficha de {ticketData.flavor}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => generateTicketImage(ticketData.id, ticketData.flavor)}
                className="px-6 py-2 bg-black text-white rounded-full font-bold hover:bg-black/80 transition-all"
              >
                Gerar Ficha
              </button>
              <button
                onClick={() => setTicketData(null)}
                className="p-2 text-black/20 hover:text-black transition-all"
              >
                <X size={20} />
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Hidden Canvas for Ticket Generation */}
      <canvas ref={canvasRef} width={300} height={400} className="hidden" />
    </div>
  );
}
