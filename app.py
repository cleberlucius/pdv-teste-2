import streamlit as st
import pandas as pd
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
import os
import textwrap
import io

# --- CONFIGURAÇÃO DA PÁGINA ---
st.set_page_config(page_title="Seven Dwarfs PDV", layout="wide", page_icon="🍺")

# --- ESTILIZAÇÃO CUSTOMIZADA ---
st.markdown("""
    <style>
    .stButton>button {
        width: 100%;
        border-radius: 12px;
        height: 3.5em;
        font-weight: bold;
        transition: all 0.2s;
    }
    .stButton>button:hover {
        border-color: #000;
        transform: translateY(-2px);
    }
    div[data-testid="stMetricValue"] { font-family: 'Courier New', monospace; }
    .vip-card {
        padding: 10px;
        background-color: #f0f2f6;
        border-radius: 10px;
        margin-bottom: 5px;
    }
    </style>
""", unsafe_allow_html=True)

# --- 1. INICIALIZAÇÃO DE ESTADOS ---
if 'vendas' not in st.session_state: st.session_state.vendas = []
if 'contas_vip' not in st.session_state: st.session_state.contas_vip = {}
if 'carrinho' not in st.session_state: st.session_state.carrinho = {}
if 'cardapio' not in st.session_state: st.session_state.cardapio = {}
if 'configurado' not in st.session_state: st.session_state.configurado = False
if 'caixa_inicial' not in st.session_state: st.session_state.caixa_inicial = 0.0
if 'fichas_pendentes' not in st.session_state: st.session_state.fichas_pendentes = []
if 'desconto' not in st.session_state: st.session_state.desconto = 0.0
if 'show_dinheiro' not in st.session_state: st.session_state.show_dinheiro = False
if 'show_vip' not in st.session_state: st.session_state.show_vip = False

# --- 2. PERSISTÊNCIA ---
def salvar_dados():
    try:
        if st.session_state.vendas:
            pd.DataFrame(st.session_state.vendas).to_csv("vendas_backup.csv", index=False)
        if st.session_state.contas_vip:
            vips_lista = [{"nome": k, "valor": v} for k, v in st.session_state.contas_vip.items()]
            pd.DataFrame(vips_lista).to_csv("vips_backup.csv", index=False)
    except: pass

def carregar_dados():
    if os.path.exists("vendas_backup.csv"):
        try: st.session_state.vendas = pd.read_csv("vendas_backup.csv").to_dict('records')
        except: pass
    if os.path.exists("vips_backup.csv"):
        try:
            vips = pd.read_csv("vips_backup.csv")
            st.session_state.contas_vip = dict(zip(vips.nome, vips.valor))
        except: pass

if not st.session_state.vendas and not st.session_state.contas_vip:
    carregar_dados()

# --- 3. GERAÇÃO DE FICHA ---
def gerar_ficha_imagem(sabor, id_venda, pagto):
    img = Image.new('RGB', (300, 450), color='white')
    draw = ImageDraw.Draw(img)
    try: font_b = ImageFont.load_default() # Em prod, use caminhos de fontes .ttf
    except: font_b = ImageFont.load_default()

    draw.rectangle([5, 5, 295, 445], outline="black", width=3)
    draw.text((150, 40), "SEVEN DWARFS", fill="black", anchor="mm")
    draw.line([50, 60, 250, 60], fill="black", width=2)
    
    draw.text((150, 180), str(sabor).upper(), fill="black", anchor="mm")
    draw.text((150, 230), f"ID: {str(id_venda)[-6:]}", fill="black", anchor="mm")
    draw.text((150, 260), f"PAGTO: {str(pagto).upper()}", fill="black", anchor="mm")
    
    footer = ["VALIDO APENAS NA DATA DE EMISSAO", "DURANTE A DURACAO DO EVENTO", "NÃO HÁ REEMBOLSO APÓS EMISSÃO"]
    y = 350
    for line in footer:
        draw.text((150, y), line, fill="black", anchor="mm")
        y += 20
    
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

# --- 4. CONFIGURAÇÃO ---
if not st.session_state.configurado:
    st.title("⚙️ Configuração do Evento")
    v_ini = st.number_input("Troco Inicial em Dinheiro (R$):", min_value=0.0, value=st.session_state.caixa_inicial)
    
    c1, c2 = st.columns(2)
    with c1:
        fixos = st.multiselect("Selecione os Sabores Fixos:", ["Pilsen", "IPA", "Black Jack", "Vinho", "Manga", "Morango"], default=["Pilsen", "IPA"])
    with c2:
        extras = st.text_area("Sabores Sazonais (separados por vírgula):", placeholder="Ex: Porter, Weiss")
    
    lista_itens = list(dict.fromkeys(fixos + [s.strip() for s in extras.split(",") if s.strip()]))
    
    if lista_itens:
        st.subheader("Ajuste os Preços")
        cp = st.columns(3)
        temp_card = {}
        for i, item in enumerate(lista_itens):
            p_ex = st.session_state.cardapio.get(item, 10.0)
            temp_card[item] = cp[i%3].number_input(f"R$ {item}:", min_value=0.0, value=float(p_ex), key=f"cfg_{item}")
        
        if st.button("ABRIR CAIXA E INICIAR EVENTO", type="primary", use_container_width=True):
            st.session_state.cardapio = temp_card
            st.session_state.caixa_inicial = v_ini
            st.session_state.configurado = True
            st.rerun()
    st.stop()

# --- 5. INTERFACE PRINCIPAL ---
t1, t2, t3 = st.tabs(["🛒 VENDAS", "🔄 ESTORNO", "📊 FECHAMENTO"])

with t1:
    col_menu, col_carrinho = st.columns([1.6, 1])
    
    with col_menu:
        st.subheader("Cardápio")
        c_btns = st.columns(2)
        for i, (nome, preco) in enumerate(st.session_state.cardapio.items()):
            if c_btns[i%2].button(f"{nome}\nR$ {preco:.2f}", key=f"btn_{nome}"):
                if nome in st.session_state.carrinho: st.session_state.carrinho[nome]['qtd'] += 1
                else: st.session_state.carrinho[nome] = {'preco': preco, 'qtd': 1}
                st.rerun()
        
        if st.session_state.contas_vip:
            st.divider()
            st.subheader("Contas VIP Abertas (Clique para Acertar)")
            for nv, tv in st.session_state.contas_vip.items():
                if tv > 0:
                    if st.button(f"👤 {nv}: R$ {tv:.2f}", key=f"settle_{nv}"):
                        st.session_state.vip_acerto = {"nome": nv, "valor": tv}

    with col_carrinho:
        st.subheader("Carrinho")
        total_v = 0.0
        if not st.session_state.carrinho:
            st.info("Carrinho vazio")
        else:
            for n, it in list(st.session_state.carrinho.items()):
                total_v += it['preco'] * it['qtd']
                with st.container(border=True):
                    c_n, c_q = st.columns([2, 1])
                    c_n.write(f"**{n}**\nR$ {it['preco']:.2f}")
                    cq1, cq2, cq3 = c_q.columns(3)
                    if cq1.button("-", key=f"m_{n}"):
                        st.session_state.carrinho[n]['qtd'] -= 1
                        if st.session_state.carrinho[n]['qtd'] <= 0: del st.session_state.carrinho[n]
                        st.rerun()
                    cq2.write(f"{it['qtd']}")
                    if cq3.button("+", key=f"p_{n}"):
                        st.session_state.carrinho[n]['qtd'] += 1
                        st.rerun()
            
            st.divider()
            
            # Campo de Desconto
            with st.expander("🏷️ Aplicar Desconto"):
                desc_val = st.number_input("Valor do Desconto (R$):", min_value=0.0, max_value=total_v, value=st.session_state.desconto, step=0.5)
                st.session_state.desconto = desc_val

            total_final = max(0.0, total_v - st.session_state.desconto)
            st.markdown(f"## TOTAL: R$ {total_final:.2f}")
            if st.session_state.desconto > 0:
                st.caption(f"*(Desconto de R$ {st.session_state.desconto:.2f} aplicado)*")
            
            # Pagamentos
            metodo = None
            p1, p2, p3 = st.columns(3)
            if p1.button("PIX"): metodo = "PIX"
            if p2.button("DÉBITO"): metodo = "Débito"
            if p3.button("CRÉDITO"): metodo = "Crédito"
            
            p4, p5, p6 = st.columns(3)
            if p4.button("DINHEIRO"): st.session_state.show_dinheiro = not st.session_state.show_dinheiro
            if p5.button("VIP"): st.session_state.show_vip = not st.session_state.show_vip
            if p6.button("CORTESIA", type="secondary"): metodo = "Cortesia"

            if st.session_state.show_dinheiro:
                v_r = st.number_input("Valor Recebido:", min_value=total_final, step=1.0)
                if st.button("CONFIRMAR DINHEIRO", type="primary"):
                    st.success(f"Troco: R$ {v_r - total_final:.2f}")
                    metodo = "Dinheiro"; st.session_state.show_dinheiro = False

            if st.session_state.show_vip:
                n_v = st.text_input("Nome do Cliente VIP:")
                if st.button("LANÇAR NO VIP", type="primary"):
                    if n_v: 
                        metodo = f"VIP"
                        st.session_state.contas_vip[n_v] = st.session_state.contas_vip.get(n_v, 0.0) + total_final
                        st.session_state.show_vip = False
                        st.session_state.vip_atual = n_v
                    else: st.error("Insira o nome")

            if metodo:
                v_id = int(datetime.now().timestamp())
                
                # Registrar o desconto como uma linha negativa se houver
                if st.session_state.desconto > 0 and metodo != "Cortesia":
                    st.session_state.vendas.append({
                        "id": v_id, 
                        "sabor": "DESCONTO APLICADO", 
                        "valor": -st.session_state.desconto, 
                        "tipo": metodo, 
                        "hora": datetime.now().strftime("%H:%M"), 
                        "vip": st.session_state.get('vip_atual', '')
                    })

                for sab, info in st.session_state.carrinho.items():
                    for _ in range(info['qtd']):
                        v_data = {"id": v_id, "sabor": sab, "valor": info['preco'] if metodo != "Cortesia" else 0, "tipo": metodo, "hora": datetime.now().strftime("%H:%M"), "vip": st.session_state.get('vip_atual', '')}
                        st.session_state.vendas.append(v_data)
                        st.session_state.fichas_pendentes.append({"img": gerar_ficha_imagem(sab, v_id, metodo), "sabor": sab})
                
                st.session_state.carrinho = {}
                st.session_state.desconto = 0.0
                st.session_state.vip_atual = ''
                salvar_dados()
                st.rerun()

    # Acerto de Conta VIP
    if 'vip_acerto' in st.session_state:
        st.divider()
        st.warning(f"Acertando conta de: **{st.session_state.vip_acerto['nome']}**")
        st.write(f"Valor Total: R$ {st.session_state.vip_acerto['valor']:.2f}")
        m_ac = st.selectbox("Método de Pagamento do Acerto", ["PIX", "Débito", "Crédito", "Dinheiro"])
        if st.button("FINALIZAR ACERTO VIP"):
            v_id = int(datetime.now().timestamp())
            st.session_state.vendas.append({"id": v_id, "sabor": f"ACERTO VIP: {st.session_state.vip_acerto['nome']}", "valor": st.session_state.vip_acerto['valor'], "tipo": m_ac, "hora": datetime.now().strftime("%H:%M")})
            st.session_state.contas_vip[st.session_state.vip_acerto['nome']] = 0
            salvar_dados()
            del st.session_state.vip_acerto
            st.success("Conta quitada!")
            st.rerun()

    # Emissão de Fichas
    if st.session_state.fichas_pendentes:
        st.divider()
        st.subheader("Fichas Geradas")
        for idx, f in enumerate(st.session_state.fichas_pendentes):
            st.image(f['img'], width=150)
            st.download_button(f"Baixar Ficha {f['sabor']}", f['img'], file_name=f"ficha_{idx}.png", mime="image/png")
        if st.button("Limpar Fichas da Tela"): 
            st.session_state.fichas_pendentes = []
            st.rerun()

# --- 6. ESTORNO ---
with t2:
    st.subheader("Estorno de Vendas")
    busca = st.text_input("Digite o ID da Venda:")
    if st.session_state.vendas:
        df_v = pd.DataFrame(st.session_state.vendas)
        if busca:
            res = df_v[df_v['id'].astype(str).str.contains(busca)]
            for i, r in res.iterrows():
                if st.button(f"Estornar {r['sabor']} (R$ {r['valor']})", key=f"est_{i}"):
                    st.session_state.vendas.remove(r.to_dict())
                    salvar_dados(); st.rerun()

# --- 7. FECHAMENTO ---
with t3:
    if st.session_state.vendas:
        df_f = pd.DataFrame(st.session_state.vendas)
        c1, c2, c3 = st.columns(3)
        c1.metric("Faturamento Total", f"R$ {df_f['valor'].sum():.2f}")
        c2.metric("Total em Dinheiro", f"R$ {df_f[df_f['tipo']=='Dinheiro']['valor'].sum():.2f}")
        c3.metric("Gaveta (Dinheiro + Troco)", f"R$ {df_f[df_f['tipo']=='Dinheiro']['valor'].sum() + st.session_state.caixa_inicial:.2f}")
        
        st.divider()
        st.subheader("Vendas por Sabor")
        st.bar_chart(df_f['sabor'].value_counts())
        
        if st.button("ZERAR TUDO PARA NOVO EVENTO"):
            if os.path.exists("vendas_backup.csv"): os.remove("vendas_backup.csv")
            if os.path.exists("vips_backup.csv"): os.remove("vips_backup.csv")
            st.session_state.clear()
            st.rerun()
    else: st.info("Sem vendas registradas.")
