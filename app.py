import streamlit as st
import sqlite3
import pandas as pd
import json
from datetime import datetime
import plotly.express as px
from PIL import Image, ImageDraw, ImageFont
import io
import os

# --- CONFIGURAÇÃO DA PÁGINA ---
st.set_page_config(
    page_title="Seven Dwarfs PDV",
    page_icon="🍺",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- ESTILIZAÇÃO CUSTOMIZADA (Tailwind-like) ---
st.markdown("""
    <style>
    .main { background-color: #F5F5F5; }
    .stButton>button {
        width: 100%;
        border-radius: 15px;
        height: 3em;
        background-color: white;
        color: black;
        border: 1px solid #E0E0E0;
        font-weight: bold;
    }
    .stButton>button:hover {
        border-color: black;
        background-color: #F9F9F9;
    }
    .payment-btn>div>button {
        background-color: #000 !important;
        color: #fff !important;
        border-radius: 20px !important;
    }
    .card {
        background-color: white;
        padding: 20px;
        border-radius: 25px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        border: 1px solid rgba(0,0,0,0.05);
        margin-bottom: 20px;
    }
    .stat-card {
        text-align: center;
        padding: 15px;
        background: white;
        border-radius: 20px;
        border: 1px solid #EEE;
    }
    </style>
""", unsafe_allow_html=True)

# --- BANCO DE DADOS ---
def init_db():
    conn = sqlite3.connect('database.db', check_same_thread=False)
    cursor = conn.cursor()
    
    # Tabela de Configuração
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            troco_inicial REAL DEFAULT 0,
            sabores_fixos TEXT DEFAULT '[]',
            sabores_sazonais TEXT DEFAULT '[]'
        )
    ''')
    
    # Tabela de Vendas
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS vendas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            data_hora TEXT DEFAULT CURRENT_TIMESTAMP,
            itens TEXT,
            total REAL,
            metodo_pagamento TEXT,
            troco REAL,
            status TEXT DEFAULT 'pago',
            vip_nome TEXT
        )
    ''')
    
    # Tabela de VIPs
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS vips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT UNIQUE,
            total_acumulado REAL DEFAULT 0
        )
    ''')
    
    # Inserir config inicial se não existir
    cursor.execute("SELECT COUNT(*) FROM config")
    if cursor.fetchone()[0] == 0:
        default_fixos = json.dumps([
            {"nome": "Pilsen", "preco": 10.0},
            {"nome": "IPA", "preco": 10.0},
            {"nome": "Black Jack", "preco": 10.0},
            {"nome": "Vinho", "preco": 10.0},
            {"nome": "Manga", "preco": 10.0},
            {"nome": "Morango", "preco": 10.0}
        ])
        cursor.execute("INSERT INTO config (id, troco_inicial, sabores_fixos, sabores_sazonais) VALUES (1, 0, ?, '[]')", (default_fixos,))
    
    conn.commit()
    return conn

conn = init_db()

# --- FUNÇÕES DE HELPER ---
def get_config():
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM config WHERE id = 1")
    row = cursor.fetchone()
    return {
        "troco_inicial": row[1],
        "sabores_fixos": json.loads(row[2]),
        "sabores_sazonais": json.loads(row[3])
    }

def save_config(troco, fixos, sazonais):
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE config SET troco_inicial = ?, sabores_fixos = ?, sabores_sazonais = ? WHERE id = 1",
        (troco, json.dumps(fixos), json.dumps(sazonais))
    )
    conn.commit()

def add_venda(itens, total, metodo, troco=0, status='pago', vip_nome=None):
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO vendas (itens, total, metodo_pagamento, troco, status, vip_nome) VALUES (?, ?, ?, ?, ?, ?)",
        (json.dumps(itens), total, metodo, troco, status, vip_nome)
    )
    venda_id = cursor.lastrowid
    
    if metodo == "VIP" and vip_nome:
        cursor.execute("SELECT id FROM vips WHERE nome = ?", (vip_nome,))
        vip = cursor.fetchone()
        if vip:
            cursor.execute("UPDATE vips SET total_acumulado = total_acumulado + ? WHERE id = ?", (total, vip[0]))
        else:
            cursor.execute("INSERT INTO vips (nome, total_acumulado) VALUES (?, ?)", (vip_nome, total))
    
    conn.commit()
    update_backups()
    return venda_id

def update_backups():
    vendas_df = pd.read_sql_query("SELECT * FROM vendas", conn)
    vips_df = pd.read_sql_query("SELECT * FROM vips", conn)
    vendas_df.to_csv("vendas_backup.csv", index=False)
    vips_df.to_csv("vips_backup.csv", index=False)

def generate_ticket(venda_id, flavor):
    img = Image.new('RGB', (300, 400), color='white')
    d = ImageDraw.Draw(img)
    
    # Tentar carregar uma fonte, senão usa a padrão
    try:
        font_title = ImageFont.truetype("Arial.ttf", 24)
        font_flavor = ImageFont.truetype("Arial.ttf", 40)
        font_small = ImageFont.truetype("Arial.ttf", 12)
    except:
        font_title = ImageFont.load_default()
        font_flavor = ImageFont.load_default()
        font_small = ImageFont.load_default()

    d.rectangle([10, 10, 290, 390], outline="black", width=2)
    d.text((150, 50), "SEVEN DWARFS", fill="black", anchor="ms", font=font_title)
    d.line([50, 70, 250, 70], fill="black", width=1)
    
    d.text((150, 180), flavor.upper(), fill="black", anchor="ms", font=font_flavor)
    d.text((150, 230), f"VENDA #{venda_id}", fill="black", anchor="ms")
    
    footer_y = 330
    d.text((150, footer_y), "ESTA FICHA É VALIDA APENAS", fill="black", anchor="ms", font=font_small)
    d.text((150, footer_y+20), "PARA O DIA DO EVENTO.", fill="black", anchor="ms", font=font_small)
    d.text((150, footer_y+40), "NÃO HÁ REEMBOLSO APÓS EMISSÃO.", fill="black", anchor="ms", font=font_small)
    
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

# --- ESTADO DA SESSÃO ---
if 'cart' not in st.session_state:
    st.session_state.cart = []
if 'last_venda' not in st.session_state:
    st.session_state.last_venda = None

# --- UI PRINCIPAL ---
st.title("🍺 Seven Dwarfs PDV")

tabs = st.tabs(["🛒 Vendas", "⚙️ Configuração", "🔍 Estorno", "📊 Fechamento", "💾 Backup"])

# --- TAB: VENDAS ---
with tabs[0]:
    config = get_config()
    col_menu, col_cart = st.columns([2, 1])
    
    with col_menu:
        st.subheader("Sabores Disponíveis")
        all_flavors = config["sabores_fixos"] + config["sabores_sazonais"]
        
        # Grid de botões
        cols = st.columns(3)
        for idx, flavor in enumerate(all_flavors):
            with cols[idx % 3]:
                if st.button(f"{flavor['nome']}\nR$ {flavor['preco']:.2f}", key=f"btn_{flavor['nome']}"):
                    # Adicionar ao carrinho
                    found = False
                    for item in st.session_state.cart:
                        if item['nome'] == flavor['nome']:
                            item['quantidade'] += 1
                            found = True
                            break
                    if not found:
                        st.session_state.cart.append({"nome": flavor['nome'], "preco": flavor['preco'], "quantidade": 1})
                    st.rerun()

        st.divider()
        st.subheader("Contas VIP Abertas")
        vips_df = pd.read_sql_query("SELECT * FROM vips WHERE total_acumulado > 0", conn)
        if not vips_df.empty:
            for _, vip in vips_df.iterrows():
                if st.button(f"👤 {vip['nome']} - R$ {vip['total_acumulado']:.2f}", key=f"vip_list_{vip['id']}"):
                    st.session_state.settle_vip = vip.to_dict()
        else:
            st.info("Nenhuma conta VIP com saldo.")

    with col_cart:
        st.subheader("Carrinho")
        total_cart = 0
        if not st.session_state.cart:
            st.write("Carrinho vazio")
        else:
            for i, item in enumerate(st.session_state.cart):
                c1, c2, c3 = st.columns([3, 1, 1])
                c1.write(f"**{item['nome']}**")
                c2.write(f"x{item['quantidade']}")
                total_cart += item['preco'] * item['quantidade']
                if c3.button("🗑️", key=f"del_{i}"):
                    st.session_state.cart.pop(i)
                    st.rerun()
            
            st.divider()
            st.metric("Total", f"R$ {total_cart:.2f}")
            
            # Métodos de Pagamento
            metodo = st.selectbox("Forma de Pagamento", ["PIX", "Débito", "Crédito", "Dinheiro", "VIP", "Cortesia"])
            
            extra_info = None
            if metodo == "Dinheiro":
                valor_pago = st.number_input("Valor Pago", min_value=total_cart, step=1.0)
                st.write(f"**Troco: R$ {valor_pago - total_cart:.2f}**")
                extra_info = valor_pago - total_cart
            elif metodo == "VIP":
                extra_info = st.text_input("Nome do VIP")
            
            if st.button("Finalizar Venda", type="primary", use_container_width=True):
                if metodo == "VIP" and not extra_info:
                    st.error("Informe o nome do VIP")
                else:
                    v_id = add_venda(st.session_state.cart, total_cart if metodo != "Cortesia" else 0, metodo, troco=extra_info if metodo == "Dinheiro" else 0, vip_nome=extra_info if metodo == "VIP" else None)
                    st.session_state.last_venda = {"id": v_id, "flavor": st.session_state.cart[-1]['nome']}
                    st.session_state.cart = []
                    st.success("Venda realizada!")
                    st.rerun()

    # Modal de Ticket (Simulado)
    if st.session_state.last_venda:
        st.divider()
        st.info(f"Venda #{st.session_state.last_venda['id']} finalizada!")
        ticket_img = generate_ticket(st.session_state.last_venda['id'], st.session_state.last_venda['flavor'])
        st.download_button("📥 Baixar Ficha (PNG)", ticket_img, file_name=f"ficha_{st.session_state.last_venda['id']}.png", mime="image/png")
        if st.button("Fechar Ticket"):
            st.session_state.last_venda = None
            st.rerun()

    # Modal de Acerto VIP
    if 'settle_vip' in st.session_state:
        st.divider()
        st.warning(f"Acertando conta de: {st.session_state.settle_vip['nome']}")
        st.write(f"Total a pagar: R$ {st.session_state.settle_vip['total_acumulado']:.2f}")
        m_acerto = st.radio("Método de Acerto", ["PIX", "Débito", "Crédito", "Dinheiro"], horizontal=True)
        if st.button("Confirmar Recebimento"):
            add_venda([{"nome": f"Acerto VIP: {st.session_state.settle_vip['nome']}", "preco": st.session_state.settle_vip['total_acumulado'], "quantidade": 1}], st.session_state.settle_vip['total_acumulado'], m_acerto)
            cursor = conn.cursor()
            cursor.execute("UPDATE vips SET total_acumulado = 0 WHERE id = ?", (st.session_state.settle_vip['id'],))
            conn.commit()
            del st.session_state.settle_vip
            st.success("Conta VIP quitada!")
            st.rerun()

# --- TAB: CONFIGURAÇÃO ---
with tabs[1]:
    st.header("Configurações do Evento")
    current_config = get_config()
    
    troco_in = st.number_input("Troco Inicial em Dinheiro (R$)", value=current_config["troco_inicial"])
    
    st.subheader("Sabores Fixos (Selecione os ativos)")
    opcoes_fixas = ["Pilsen", "IPA", "Black Jack", "Vinho", "Manga", "Morango"]
    selecionados = []
    
    for s in opcoes_fixas:
        existente = next((f for f in current_config["sabores_fixos"] if f["nome"] == s), None)
        col1, col2 = st.columns([1, 3])
        ativo = col1.checkbox(s, value=existente is not None, key=f"chk_{s}")
        preco = col2.number_input(f"Preço {s}", value=existente["preco"] if existente else 10.0, key=f"prc_{s}")
        if ativo:
            selecionados.append({"nome": s, "preco": preco})
            
    st.divider()
    st.subheader("Sabores Sazonais")
    sazonais_raw = st.text_area("Nomes (separados por vírgula)", value=", ".join([f["nome"] for f in current_config["sabores_sazonais"]]))
    
    sazonais_list = []
    if sazonais_raw:
        nomes = [n.strip() for n in sazonais_raw.split(",") if n.strip()]
        for n in nomes:
            existente = next((f for f in current_config["sabores_sazonais"] if f["nome"] == n), None)
            p = st.number_input(f"Preço {n}", value=existente["preco"] if existente else 10.0, key=f"saz_{n}")
            sazonais_list.append({"nome": n, "preco": p})
            
    if st.button("Salvar Configurações", type="primary"):
        save_config(troco_in, selecionados, sazonais_list)
        st.success("Configurações salvas!")

# --- TAB: ESTORNO ---
with tabs[2]:
    st.header("Estorno de Vendas")
    v_id_search = st.text_input("ID da Venda")
    if v_id_search:
        venda_res = pd.read_sql_query(f"SELECT * FROM vendas WHERE id = {v_id_search}", conn)
        if not venda_res.empty:
            st.write(venda_res)
            if st.button("Confirmar Estorno Total", type="primary"):
                cursor = conn.cursor()
                # Se for VIP, subtrair do saldo
                v_data = venda_res.iloc[0]
                if v_data['metodo_pagamento'] == "VIP" and v_data['vip_nome']:
                    cursor.execute("UPDATE vips SET total_acumulado = total_acumulado - ? WHERE nome = ?", (v_data['total'], v_data['vip_nome']))
                
                cursor.execute("DELETE FROM vendas WHERE id = ?", (v_id_search,))
                conn.commit()
                st.success("Venda estornada com sucesso!")
                update_backups()
        else:
            st.error("Venda não encontrada.")

# --- TAB: FECHAMENTO ---
with tabs[3]:
    st.header("Relatório de Fechamento")
    vendas_df = pd.read_sql_query("SELECT * FROM vendas", conn)
    config = get_config()
    
    if not vendas_df.empty:
        total_vendas = vendas_df['total'].sum()
        col1, col2, col3 = st.columns(3)
        col1.metric("Faturamento Total", f"R$ {total_vendas:.2f}")
        col2.metric("Troco Inicial", f"R$ {config['troco_inicial']:.2f}")
        col3.metric("Total em Gaveta", f"R$ {total_vendas + config['troco_inicial']:.2f}")
        
        # Gráfico por Sabor
        itens_list = []
        for _, row in vendas_df.iterrows():
            itens_list.extend(json.loads(row['itens']))
        
        df_itens = pd.DataFrame(itens_list)
        df_resumo = df_itens.groupby('nome')['quantidade'].sum().reset_index()
        
        fig_sabor = px.bar(df_resumo, x='nome', y='quantidade', title="Vendas por Sabor", color='quantidade')
        st.plotly_chart(fig_sabor, use_container_width=True)
        
        # Gráfico por Hora
        vendas_df['hora'] = pd.to_datetime(vendas_df['data_hora']).dt.hour
        df_hora = vendas_df.groupby('hora')['total'].sum().reset_index()
        fig_hora = px.line(df_hora, x='hora', y='total', title="Faturamento por Hora", markers=True)
        st.plotly_chart(fig_hora, use_container_width=True)
        
        st.subheader("Detalhes das Vendas")
        st.dataframe(vendas_df, use_container_width=True)
    else:
        st.info("Nenhuma venda registrada ainda.")

# --- TAB: BACKUP ---
with tabs[4]:
    st.header("Gerenciamento de Dados")
    
    c1, c2 = st.columns(2)
    with open("vendas_backup.csv", "rb") as f:
        c1.download_button("📥 Baixar Backup Vendas (CSV)", f, "vendas.csv", "text/csv")
    
    if os.path.exists("vips_backup.csv"):
        with open("vips_backup.csv", "rb") as f:
            c2.download_button("📥 Baixar Backup VIPs (CSV)", f, "vips.csv", "text/csv")
            
    st.divider()
    st.subheader("⚠️ Zona de Perigo")
    if st.button("ZERAR SISTEMA (CUIDADO)", type="secondary"):
        if st.checkbox("Eu entendo que isso apagará TODOS os dados permanentemente"):
            cursor = conn.cursor()
            cursor.execute("DELETE FROM vendas")
            cursor.execute("DELETE FROM vips")
            cursor.execute("UPDATE config SET troco_inicial = 0, sabores_fixos = '[]', sabores_sazonais = '[]' WHERE id = 1")
            conn.commit()
            st.warning("Sistema zerado. Recarregue a página.")
            update_backups()
