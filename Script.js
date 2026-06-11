async function gerarSenhaProtegida(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function orcamentoApp() {
    return {
        // !!! INSIRA A URL DO SEU GOOGLE APPS SCRIPT DEPLOYADO AQUI !!!
        urlBackend: 'https://script.google.com/macros/s/AKfycbytHQCTpDlutQua0xu2_LhIZ-tXmSryqNI-07Aq8j4kK5ValGU0rVGgWS2zVbcV77B2OQ/exec',

        async chamarBackend(action, params = {}) {
            try {
                // A requisição precisa ser enviada como texto simples para não acionar o bloqueio OPTIONS (Pre-flight CORS)
                const response = await fetch(this.urlBackend, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'text/plain;charset=utf-8'
                    },
                    redirect: 'follow', // Obrigatório para a API do Google Script funcionar e retornar dados
                    body: JSON.stringify({ action: action, ...params })
                });

                // Aqui pegamos o resultado
                const res = await response.json();
                
                if (!res.success) throw new Error(res.error);
                return res.data;
                
            } catch (err) {
                console.error('Erro de comunicação com a API:', err);
                this.notificar('Erro de Conexão', 'Não foi possível salvar ou buscar dados do Google Sheets.', 'erro');
                throw err;
            }
        },

        tab: 'dashboard',
        aberto: false,
        inicializando: true, 
        carregando: false,    
        houveAlteracao: false, 
        novoItem: { id: null, desc: '', valor: '', valorDisplay: '', categoria: '', vencimento: '', datapag: '', status: 'Pendente', tipo: 'Variavel', obs: '', datareceb: '' },
        toasts: [],
        lastSyncTime: 0,
        
        modalExcluir: { aberto: false, itemDesc: '', itemLinha: null },
        modalPagar: { aberto: false, item: null, novoValor: 0 },

        telaLogin: true,
        loginNome: '',
        loginSenha: '',
        loginErro: '',
        usuarioLogado: null,
        perfilEdit: {nome: '', email: '', senha: ''},

        darkMode: localStorage.getItem('meuorc_dark') === 'true',
        temaAtivo: localStorage.getItem('meuorc_tema') || 'pastel',
        
        configSubAba: '',
        buscaTermo: '',
        mostrarFiltros: false,
        filtroCategoriaGeral: '',
        ordemFiltro: 'dataAsc',
        mesFiltro: new Date().getMonth() + 1,
        anoFiltro: new Date().getFullYear(),
 
        chartPizzaInstance: null,
        chartReceitaPizzaInstance: null,
        chartSaldosInstance: null,

        resumoModoExibicao: 'blocos',
        qtdMesesVisao: window.innerWidth < 768 ? 1 : 6,

        listagemRetratil: false,
        receitasExpandido: false,
        despesasExpandido: false,

        formCompraAberto: false,
        compraCredito: 'Credito Athus',
        compraMes: new Date().getMonth() + 1,
        compraValor: '',
        compraParcelas: 1,
        opcoesCredito: ['Credito Athus', 'Dica', 'Daianne'],

        novaCategoriaTexto: '',
        categoriasLista: ['Moradia', 'Alimentação', 'Transporte', 'Lazer', 'Saúde'],
        
        novaFonteNoticia: '',
        fontesNoticias: ['TechTudo', 'InfoMoney', 'Valor Econômico', 'Exame'],
        noticiasExibicao: [],

        novoUser: {nome:'', email:'', senha:'', nivel:'USUARIO'},
        usuariosLista: [],
        
        sidebarCompactaUsuario: localStorage.getItem('meuorc_side_comp') === 'true',
        sidebarMenuExpandido: !(localStorage.getItem('meuorc_side_comp') === 'true'),
        
        ordemTelasMobile: ['configuracoes', 'resumoAnual', 'dashboard', 'resumoDia', 'despesas', 'receitas'],
        nomeTelas: {
            'configuracoes': 'Configurações',
            'resumoAnual': 'Visão Geral (Anual)',
            'dashboard': 'Dashboard',
            'resumoDia': 'Resumo (Pagar)',
            'despesas': 'Despesas',
            'receitas': 'Receitas'
        },
        touchStartX: 0,
        touchStartY: 0,
        touchEndX: 0,
        touchEndY: 0,
        isSwiping: false,
        swipeOffset: 0,

        gradeExcelAgrupada: [],
        gradeExcelAgrupadaReceitas: [],
        receitasData: [],
        despesasData: [],
        historicoAtividades: [],

        init() {
            this.$watch('darkMode', val => {
                localStorage.setItem('meuorc_dark', val);
                if(this.tab === 'dashboard' && !this.telaLogin) this.redesenharGraficosDashboard();
            });
            window.addEventListener('resize', () => {
                this.qtdMesesVisao = window.innerWidth < 768 ? 1 : 6;
            });
            this.gerarMockNoticias();
        },

        async checarESincronizar() {
            try {
                const timestamp = await this.chamarBackend('verificarAtualizacoes');
                const ts = Number(timestamp);
                if (this.lastSyncTime !== 0 && ts > this.lastSyncTime) {
                    this.atualizarCacheBackgroundSilencioso();
                }
                this.lastSyncTime = ts;
            } catch (e) {}
        },

        limparFormulario() {
            this.novoItem = { id: null, desc: '', valor: '', valorDisplay: '', categoria: '', vencimento: '', datapag: '', status: 'Pendente', tipo: 'Variavel', obs: '', datareceb: '' };
        },

        gerarProximoId() {
            const extrairIds = (arr) => arr.map(i => Number(i.id)).filter(id => !isNaN(id));
            const maxReceita = Math.max(0, ...extrairIds(this.receitasData));
            const maxDespesa = Math.max(0, ...extrairIds(this.despesasData));
            return Math.max(maxReceita, maxDespesa) + 1;
        },

        async registrarHistorico(acao, detalhes) {
            const autor = this.usuarioLogado ? this.usuarioLogado.nome : 'Sistema';
            try {
                await this.chamarBackend('registrarLogPlanilha', { acao: acao, detalhes: detalhes, usuario: autor });
            } catch(e) {}
            const novoLog = { data: new Date().toLocaleString('pt-BR'), acao: acao, detalhes: detalhes, usuario: autor };
            this.historicoAtividades.unshift(novoLog);
            if(this.historicoAtividades.length > 50) this.historicoAtividades.pop();
            localStorage.setItem('cache_historico', JSON.stringify(this.historicoAtividades));
            this.houveAlteracao = true;
        },

        get categoriesExibicao() { return this.categoriasLista; },

        handleTouchStart(e) { 
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY; 
            this.isSwiping = false;
            this.swipeOffset = 0;
        },
        
        handleTouchMove(e) {
            if (window.innerWidth >= 768) return;
            let currentX = e.touches[0].clientX;
            let currentY = e.touches[0].clientY;
            let diffX = currentX - this.touchStartX;
            let diffY = currentY - this.touchStartY;
            if (!this.isSwiping && Math.abs(diffY) > Math.abs(diffX)) {
                return;
            }
            this.isSwiping = true;
            this.swipeOffset = diffX;
        },

        handleTouchEnd(e) { 
            if (!this.isSwiping) return;
            this.touchEndX = e.changedTouches[0].clientX;
            this.touchEndY = e.changedTouches[0].clientY; 
            let finalOffset = this.swipeOffset;
            this.isSwiping = false; 
            this.swipeOffset = 0;
            this.verificarGestoDeslize(finalOffset);
        },
        
        verificarGestoDeslize(diffX) {
            if (window.innerWidth >= 768) return;
            const minSwipeDistance = 60;
            const currentIndex = this.ordemTelasMobile.indexOf(this.tab);
            if (currentIndex === -1) return;
            if (diffX < -minSwipeDistance) {
                if (currentIndex < this.ordemTelasMobile.length - 1) this.mudarAba(this.ordemTelasMobile[currentIndex + 1]);
            } else if (diffX > minSwipeDistance) {
                if (currentIndex > 0) this.mudarAba(this.ordemTelasMobile[currentIndex - 1]);
            }
        },
        
        moverTelaMobile(index, direction) {
            const newIndex = index + direction;
            if (newIndex < 0 || newIndex >= this.ordemTelasMobile.length) return;
            const temp = this.ordemTelasMobile[index];
            this.ordemTelasMobile[index] = this.ordemTelasMobile[newIndex];
            this.ordemTelasMobile[newIndex] = temp;
        },
        
        async salvarOrdemTelasNuvem() {
            this.carregando = true;
            try {
                await this.chamarBackend('salvarConfiguracaoPlanilha', { chave: 'ordem_telas_mobile', valor: JSON.stringify(this.ordemTelasMobile) });
                this.notificar('Sucesso', 'Ordem de telas salva.', 'sucesso'); 
            } catch(e) {}
            this.carregando = false;
        },

        toggleFullScreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.log(`Erro ao tentar ativar fullscreen: ${err.message}`);
                });
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        },

        abrirNovoCadastro() {
            this.limparFormulario();
            this.aberto = true;
            this.$nextTick(() => {
                const el = document.getElementById('formularioOrcamento');
                if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        },

        mesAnterior() {
            this.mesFiltro--;
            if(this.mesFiltro < 1) { this.mesFiltro = 12; this.anoFiltro--; }
            this.renderizarAbaAtual();
        },
        mesSeguinte() {
            this.mesFiltro++;
            if(this.mesFiltro > 12) { this.mesFiltro = 1; this.anoFiltro++; }
            this.renderizarAbaAtual();
        },
        obterNomeMes(m) {
            const nomes = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            return nomes[m];
        },
        obterArrayMesesGeral(inicio, qtd) {
            let meses = [];
            let m = Number(inicio);
            for(let i=0; i<qtd; i++) {
                meses.push(m);
                m++;
                if(m > 12) m = 1;
            }
            return meses;
        },

        construirGradeExcelReal() {
            const descricoesDespesas = [...new Set(this.despesasData.map(d => d.desc.trim()))];
            this.gradeExcelAgrupada = descricoesDespesas.map(descricao => {
                const valoresMeses = {};
                for(let i=1; i<=12; i++) valoresMeses[i] = '0,00';
                this.despesasData.forEach(item => {
                    if (item.desc.trim() === descricao && item.vencimento) {
                        let dObj = new Date(item.vencimento);
                        let loc = new Date(dObj.getTime() + dObj.getTimezoneOffset() * 60000);
                        if (loc.getFullYear() === Number(this.anoFiltro)) {
                            valoresMeses[loc.getMonth() + 1] = Number(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        }
                    }
                });
                return { desc: descricao, valores: valoresMeses };
            });

            const descricoesReceitas = [...new Set(this.receitasData.map(d => d.desc.trim()))];
            this.gradeExcelAgrupadaReceitas = descricoesReceitas.map(descricao => {
                const valoresMeses = {};
                for(let i=1; i<=12; i++) valoresMeses[i] = '0,00';
                this.receitasData.forEach(item => {
                    if (item.desc.trim() === descricao && item.datareceb) {
                        let dObj = new Date(item.datareceb);
                        let loc = new Date(dObj.getTime() + dObj.getTimezoneOffset() * 60000);
                        if (loc.getFullYear() === Number(this.anoFiltro)) {
                            valoresMeses[loc.getMonth() + 1] = Number(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        }
                    }
                });
                return { desc: descricao, valores: valoresMeses };
            });
        },

        sanitizarCelulaExcel(linha, mes) {
            let v = linha.valores[mes];
            if(!v) v = '0';
            v = v.replace('R$', '').trim();
            if(v.includes('.') && v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
            else if(v.includes(',')) v = v.replace(',', '.');
            const num = Number(v);
            linha.valores[mes] = (isNaN(num) ? 0 : num).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },

        calcularTotalLinhaExcel(linha) {
            let sum = 0;
            for(let i=1; i<=12; i++) { sum += Number(linha.valores[i].replace(/\./g, '').replace(',', '.')); }
            return sum;
        },
        calcularTotalColunaExcel(mes, agrupamento) {
            let sum = 0;
            agrupamento.forEach(linha => { sum += Number(linha.valores[mes].replace(/\./g, '').replace(',', '.')); });
            return sum;
        },
        calcularTotalGeralExcel(agrupamento) {
            let sum = 0;
            for(let i=1; i<=12; i++) sum += this.calcularTotalColunaExcel(i, agrupamento);
            return sum;
        },

        async salvarAlteracoesEmMassaExcel() {
            this.carregando = true;
            let promessasTotais = 0;
            let logsLocais = [];

            const processarGrade = async (grade, dataArray, aba, tipoData) => {
                for (const linhaAgrupada of grade) {
                    for(let m = 1; m <= 12; m++) {
                        let valorFloat = Number(linhaAgrupada.valores[m].replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
                        
                        const itemReal = dataArray.find(d => {
                            if(d.desc.trim() !== linhaAgrupada.desc.trim()) return false;
                            let dateObj = new Date(d[tipoData]);
                            let loc = new Date(dateObj.getTime() + dateObj.getTimezoneOffset() * 60000);
                            return loc.getMonth() + 1 === m && loc.getFullYear() === Number(this.anoFiltro);
                        });

                        if(itemReal && Number(itemReal.valor) !== valorFloat) {
                            promessasTotais++;
                            logsLocais.push(`${itemReal.desc} (${aba}) de R$${itemReal.valor} para R$${valorFloat}`);
                            let payload;
                            if(aba === 'receitas') {
                                payload = [itemReal.id, itemReal.desc, valorFloat, itemReal.datareceb, itemReal.obs || ''];
                            } else {
                                payload = [itemReal.id, itemReal.desc, itemReal.categoria || 'Geral', valorFloat, itemReal.vencimento, itemReal.datapag || '', itemReal.status, itemReal.tipo, itemReal.obs || ''];
                            }

                            try {
                                await this.chamarBackend('salvarItemPlanilha', { aba: aba, dados: payload, linha: itemReal.linha });
                                promessasTotais--;
                                if(promessasTotais === 0) { 
                                    this.registrarHistorico('Edição em Massa', logsLocais.join(' | '));
                                    this.notificar('Sucesso', 'Planilhas atualizadas estilo Excel.', 'sucesso'); 
                                    this.atualizarCacheBackground(); 
                                }
                            } catch(e) {
                                this.carregando = false;
                            }
                        }
                    }
                }
            };

            await processarGrade(this.gradeExcelAgrupada, this.despesasData, 'despesas', 'vencimento');
            await processarGrade(this.gradeExcelAgrupadaReceitas, this.receitasData, 'receitas', 'datareceb');

            if(promessasTotais === 0) { 
                this.carregando = false;
                this.notificar('Aviso', 'Nenhuma célula teve o valor alterado.', 'info'); 
            }
        },

        async processarCompraCartao() {
            if(!this.compraValor || this.compraValor <= 0) {
                this.notificar('Aviso', 'Insira um valor válido para a compra.', 'erro');
                return;
            }
            this.carregando = true;
            let vStr = String(this.compraValor).replace('R$', '').trim();
            if(vStr.includes('.') && vStr.includes(',')) vStr = vStr.replace(/\./g, '').replace(',', '.');
            else if(vStr.includes(',')) vStr = vStr.replace(',', '.');
            let valorTotal = Number(vStr);
            if(isNaN(valorTotal) || valorTotal <= 0) { this.carregando = false; return; }

            let parcelas = Number(this.compraParcelas);
            let valorParcela = Number((valorTotal / parcelas).toFixed(2));
            
            let itensAtualizar = [];
            let itensNovos = [];
            
            let mAtual = Number(this.compraMes);
            let anoAtual = Number(this.anoFiltro);
            
            for(let i=0; i < parcelas; i++) {
                let m = mAtual + i;
                let y = anoAtual;
                while(m > 12) { m -= 12; y++; }
                
                let itemExistente = this.despesasData.find(d => {
                    if (d.desc.trim() !== this.compraCredito) return false;
                    if (!d.vencimento) return false;
                    let dt = new Date(d.vencimento);
                    let loc = new Date(dt.getTime() + dt.getTimezoneOffset() * 60000);
                    return (loc.getMonth() + 1) === m && loc.getFullYear() === y;
                });

                if(itemExistente) {
                    itemExistente.valor = Number(itemExistente.valor) + valorParcela;
                    let payload = [itemExistente.id, itemExistente.desc, itemExistente.categoria || 'Cartão', Number(itemExistente.valor), itemExistente.vencimento, itemExistente.datapag || '', itemExistente.status, itemExistente.tipo, itemExistente.obs || ''];
                    itensAtualizar.push({ linha: itemExistente.linha, dados: payload });
                } else {
                    let novoVencimento = `${y}-${String(m).padStart(2, '0')}-10`;
                    let novoId = this.gerarProximoId() + i + Math.floor(Math.random() * 100);
                    let novoItem = { id: novoId, desc: this.compraCredito, categoria: 'Cartão', valor: valorParcela, vencimento: novoVencimento, datapag: '', status: 'Pendente', tipo: 'Variavel', obs: `Compra parcelada (${i+1}/${parcelas})` };
                    let payload = [novoItem.id, novoItem.desc, novoItem.categoria, novoItem.valor, novoItem.vencimento, novoItem.datapag, novoItem.status, novoItem.tipo, novoItem.obs];
                    itensNovos.push(payload);
                }
            }
            
            try {
                await this.chamarBackend('salvarMultiplosItensPlanilha', { aba: 'despesas', itensAtualizar: itensAtualizar, itensNovos: itensNovos });
                this.formCompraAberto = false;
                this.compraValor = '';
                this.compraParcelas = 1;
                await this.registrarHistorico('Compra Efetuada', `${parcelas}x de R$${valorParcela} agregada em ${this.compraCredito}.`);
                this.notificar('Compra Registrada', `Adicionado ${parcelas} parcelas na visão geral.`, 'sucesso');
                this.atualizarCacheBackground();
            } catch(e) {}
            this.carregando = false;
        },

        get contasAVencerMesAtual() {
            const hoje = new Date();
            const mAct = hoje.getMonth() + 1;
            const yAct = hoje.getFullYear();
            return this.despesasData.filter(d => {
                if (!d.vencimento || d.status === 'Pago') return false;
                let dt = new Date(d.vencimento);
                let loc = new Date(dt.getTime() + dt.getTimezoneOffset() * 60000);
                return (loc.getMonth() + 1) === mAct && loc.getFullYear() === yAct;
            }).sort((a,b) => new Date(a.vencimento) - new Date(b.vencimento));
        },

        get alertaGastos() {
            const { receitas, despesas } = this.totaisDashboard;
            if (receitas === 0 && despesas === 0) return { titulo: 'BEM-VINDO', mensagem: 'Pronto para organizar suas finanças.', corText: 'text-blue-500', corBorda: 'bg-blue-500' };
            if (receitas === 0) return { titulo: 'ATENÇÃO', mensagem: 'Nenhuma receita neste mês e já existem despesas.', corText: 'text-orange-500', corBorda: 'bg-orange-500' };
            const perc = despesas / receitas;
            if (perc > 1) return { titulo: 'ALERTA VERMELHO', mensagem: `Você já comprometeu ${(perc*100).toFixed(0)}% do que ganha! Evite novos gastos!`, corText: 'text-rose-600', corBorda: 'bg-rose-600' };
            if (perc > 0.8) return { titulo: 'LIMITE PRÓXIMO', mensagem: `Você atingiu ${(perc*100).toFixed(0)}% das receitas. Avalie suas prioridades!`, corText: 'text-yellow-600', corBorda: 'bg-yellow-600' };
            return { titulo: 'SAÚDE FINANCEIRA OK', mensagem: `Gastos sob controle (${(perc*100).toFixed(0)}% da receita utilizada).`, corText: 'text-emerald-600', corBorda: 'bg-emerald-600' };
        },

        get saldoMomentoReal() {
            const hoje = new Date();
            hoje.setHours(23,59,59,999);
            const receitasJaPagas = this.receitasData.filter(r => {
                if(!r.datareceb) return false;
                let dt = new Date(r.datareceb);
                let loc = new Date(dt.getTime() + dt.getTimezoneOffset() * 60000);
                return loc <= hoje;
            }).reduce((a, b) => a + Number(b.valor), 0);
            const despesasPagas = this.despesasData.filter(d => d.status === 'Pago').reduce((a, b) => a + Number(b.valor), 0);
            return receitasJaPagas - despesasPagas;
        },

        get listaFiltrada() {
            if (this.tab === 'dashboard' || this.tab === 'configuracoes' || this.tab === 'resumoAnual' || this.tab === 'resumoDia') return [];
            const listaBase = this.tab === 'receitas' ? this.receitasData : this.despesasData;
            let filtrada = listaBase.filter(item => {
                let dataStr = (this.tab === 'receitas') ? item.datareceb : item.vencimento;
                if (!dataStr) return false;
                let dataObj = new Date(dataStr);
                if (isNaN(dataObj.getTime())) return false;
                let localData = new Date(dataObj.getTime() + dataObj.getTimezoneOffset() * 60000);
                const bateMesAno = (localData.getMonth() + 1) === Number(this.mesFiltro) && localData.getFullYear() === Number(this.anoFiltro);
                if(!bateMesAno) return false;

                if (this.buscaTermo.trim() !== '') {
                    const t = this.buscaTermo.toLowerCase();
                    const matchTexto = (item.desc||'').toLowerCase().includes(t) || (item.categoria||'').toLowerCase().includes(t);
                    if(!matchTexto) return false;
                }

                if (this.filtroCategoriaGeral && this.filtroCategoriaGeral !== '') {
                    if ((item.categoria || '') !== this.filtroCategoriaGeral) return false;
                }
                return true;
            });

            filtrada.sort((a, b) => {
                if(this.tab === 'despesas') {
                    if (a.status === 'Pago' && b.status !== 'Pago') return 1;
                    if (a.status !== 'Pago' && b.status === 'Pago') return -1;
                }
                if (this.ordemFiltro === 'alfabetica') {
                    return (a.desc || '').localeCompare(b.desc || '');
                } else if (this.ordemFiltro === 'alfabeticaDesc') {
                    return (b.desc || '').localeCompare(a.desc || '');
                } else if (this.ordemFiltro === 'valorDesc') {
                    return Number(b.valor) - Number(a.valor);
                } else if (this.ordemFiltro === 'valorAsc') {
                    return Number(a.valor) - Number(b.valor);
                } else if (this.ordemFiltro === 'dataAsc') {
                    let dA = new Date(this.tab === 'receitas' ? a.datareceb : a.vencimento);
                    let dB = new Date(this.tab === 'receitas' ? b.datareceb : b.vencimento);
                    return dA - dB;
                } else if (this.ordemFiltro === 'dataDesc') {
                    let dA = new Date(this.tab === 'receitas' ? a.datareceb : a.vencimento);
                    let dB = new Date(this.tab === 'receitas' ? b.datareceb : b.vencimento);
                    return dB - dA;
                }
                return 0;
            });
            return filtrada;
        },

        get contasAVencerMes() {
            const mAct = Number(this.mesFiltro);
            const yAct = Number(this.anoFiltro);
            return this.despesasData.filter(d => {
                if (!d.vencimento) return false;
                let dt = new Date(d.vencimento);
                let loc = new Date(dt.getTime() + dt.getTimezoneOffset() * 60000);
                return (loc.getMonth() + 1) === mAct && loc.getFullYear() === yAct;
            }).sort((a,b) => {
                if (a.status === 'Pago' && b.status !== 'Pago') return 1;
                if (a.status !== 'Pago' && b.status === 'Pago') return -1;
                return new Date(a.vencimento) - new Date(b.vencimento);
            });
        },

        get receitasResumo() {
            let atual = 0, proximo = 0;
            const mAct = Number(this.mesFiltro);
            const yAct = Number(this.anoFiltro);
            let mProx = mAct + 1, yProx = yAct;
            if(mProx > 12) { mProx = 1; yProx++; }

            this.receitasData.forEach(r => {
                if(!r.datareceb) return;
                let loc = new Date(new Date(r.datareceb).getTime() + new Date(r.datareceb).getTimezoneOffset() * 60000);
                let val = Number(r.valor || 0);
                if(loc.getMonth() + 1 === mAct && loc.getFullYear() === yAct) {
                    atual += val;
                } else if(loc.getMonth() + 1 === mProx && loc.getFullYear() === yProx) {
                    proximo += val;
                }
            });
            return { atual, proximo };
        },

        get despesasResumo() {
            let atual = 0, proximo = 0, faltaPagar = 0;
            const mAct = Number(this.mesFiltro);
            const yAct = Number(this.anoFiltro);
            let mProx = mAct + 1, yProx = yAct;
            if(mProx > 12) { mProx = 1; yProx++; }

            this.despesasData.forEach(d => {
                if(!d.vencimento) return;
                let loc = new Date(new Date(d.vencimento).getTime() + new Date(d.vencimento).getTimezoneOffset() * 60000);
                let val = Number(d.valor || 0);
                if(loc.getMonth() + 1 === mAct && loc.getFullYear() === yAct) {
                    atual += val;
                    if(d.status !== 'Pago') faltaPagar += val;
                } else if(loc.getMonth() + 1 === mProx && loc.getFullYear() === yProx) {
                    proximo += val;
                }
            });
            return { atual, proximo, faltaPagar };
        },

        get totaisDashboard() {
            const filtrar = (lst, fld) => lst.filter(i => {
                if(!i[fld]) return false;
                let loc = new Date(new Date(i[fld]).getTime() + new Date(i[fld]).getTimezoneOffset() * 60000);
                return (loc.getMonth() + 1) === Number(this.mesFiltro) && loc.getFullYear() === Number(this.anoFiltro);
            });
            const sR = filtrar(this.receitasData, 'datareceb').reduce((acc, c) => acc + Number(c.valor || 0), 0);
            const sD = filtrar(this.despesasData, 'vencimento').reduce((acc, c) => acc + Number(c.valor || 0), 0);
            return { receitas: sR, despesas: sD, saldo: sR - sD };
        },

        processarValorInput() {
            let v = this.novoItem.valorDisplay;
            if(!v) return;
            v = v.replace('R$', '').trim();
            if(v.includes('.') && v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
            else if(v.includes(',')) v = v.replace(',', '.');
            const num = Number(v); this.novoItem.valor = isNaN(num) ? 0 : num;
            this.novoItem.valorDisplay = this.formatarMoeda(this.novoItem.valor);
        },

        notificar(titulo, message, tipo = 'sucesso') {
            const id = Date.now();
            this.toasts.push({ id, titulo, mensagem: message, tipo, visivel: true });
            setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, 3500);
        },

        sincronizarCacheLocal(receitas, despesas) {
            this.receitasData = receitas;
            this.despesasData = despesas;
            localStorage.setItem('cache_receitas', JSON.stringify(receitas));
            localStorage.setItem('cache_despesas', JSON.stringify(despesas));
        },

        async inicializarSistema() {
            try {
                const todoOrcamento = await this.chamarBackend('carregarTodoOrcamento');
                if(todoOrcamento.configuracoes && todoOrcamento.configuracoes.tema_ativo) {
                    this.temaAtivo = todoOrcamento.configuracoes.tema_ativo === 'default' ? 'pastel' : todoOrcamento.configuracoes.tema_ativo;
                }
                if (todoOrcamento.requerLogin) {
                    this.telaLogin = true;
                    this.inicializando = false;
                    return;
                }
                this.aplicarDadosSistema(todoOrcamento);
            } catch(fail) {
                this.inicializando = false; 
                this.receitasData = JSON.parse(localStorage.getItem('cache_receitas') || '[]');
                this.despesasData = JSON.parse(localStorage.getItem('cache_despesas') || '[]');
                this.renderizarAbaAtual();
            }
        },

        async efetuarLogin() {
            if(!this.loginNome || !this.loginSenha) return;
            this.carregando = true;
            this.loginErro = '';
            const senhaHash = await generarSenhaProtegida(this.loginSenha);
            try {
                const resp = await this.chamarBackend('autenticarUsuario', { nome: this.loginNome, senhaHash: senhaHash });
                if (resp.erro) {
                    this.loginErro = resp.erro;
                    this.notificar('Erro', 'Usuário ou senha incorretos.', 'erro');
                } else {
                    this.telaLogin = false;
                    this.usuarioLogado = resp.usuarioLogado;
                    this.perfilEdit = { nome: this.usuarioLogado.nome, email: this.usuarioLogado.email, senha: '' };
                    this.aplicarDadosSistema(resp);
                    this.notificar('Sucesso', 'Acesso liberado.', 'sucesso');
                }
            } catch(e) {}
            this.carregando = false;
        },

        aplicarDadosSistema(todoOrcamento) {
            this.sincronizarCacheLocal(todoOrcamento.receitas, todoOrcamento.despesas);
            if(todoOrcamento.configuracoes.listagem_retratil !== undefined) {
                this.listagemRetratil = String(todoOrcamento.configuracoes.listagem_retratil) === 'true';
            }
            if(todoOrcamento.configuracoes.fontes_noticias_json) this.fontesNoticias = JSON.parse(todoOrcamento.configuracoes.fontes_noticias_json);
            if(todoOrcamento.configuracoes.categorias_json) this.categoriasLista = JSON.parse(todoOrcamento.configuracoes.categorias_json);
            if(todoOrcamento.configuracoes.usuarios_json) {
                this.usuariosLista = JSON.parse(todoOrcamento.configuracoes.usuarios_json).map(u => ({...u, nivel: u.nivel || 'ADMIN'}));
            } else {
                this.usuariosLista = [{nome: 'Administrador Orc', email: 'admin@meuorc.com', nivel: 'ADMIN'}];
            }

            if(todoOrcamento.configuracoes.sidebar_compacta !== undefined) {
                const isComp = String(todoOrcamento.configuracoes.sidebar_compacta) === 'true';
                this.sidebarCompactaUsuario = isComp; 
                this.sidebarMenuExpandido = !isComp;
            }
            if(todoOrcamento.configuracoes.modo_exibicao_resumo) {
                this.resumoModoExibicao = todoOrcamento.configuracoes.modo_exibicao_resumo;
            }
            if(todoOrcamento.configuracoes.ordem_telas_mobile) {
                try { this.ordemTelasMobile = JSON.parse(todoOrcamento.configuracoes.ordem_telas_mobile); } catch(e){}
            }

            this.lastSyncTime = Number(todoOrcamento.configuracoes.ultima_alteracao || Date.now());
            if (todoOrcamento.historico && todoOrcamento.historico.length > 0) {
                this.historicoAtividades = todoOrcamento.historico;
                localStorage.setItem('cache_historico', JSON.stringify(this.historicoAtividades));
            } else {
                this.historicoAtividades = JSON.parse(localStorage.getItem('cache_historico') || '[]');
            }

            this.inicializando = false;
            this.gerarMockNoticias();
            this.renderizarAbaAtual();
        },

        nomeModoAtualExibicao() {
            if(this.resumoModoExibicao === 'blocos') return 'Mudar para Blocos Retangulares';
            if(this.resumoModoExibicao === 'blocos_retangulares') return 'Mudar para Lista (Tabela)';
            return 'Mudar para Blocos (Grade)';
        },

        async alternarModoExibicaoResumo() {
            if(this.resumoModoExibicao === 'blocos') this.resumoModoExibicao = 'blocos_retangulares';
            else if(this.resumoModoExibicao === 'blocos_retangulares') this.resumoModoExibicao = 'lista';
            else this.resumoModoExibicao = 'blocos';
            try {
                await this.chamarBackend('salvarConfiguracaoPlanilha', { chave: 'modo_exibicao_resumo', valor: this.resumoModoExibicao });
            } catch(e) {}
        },

        avancarParaMesComPendencias() {
            let tentativas = 0;
            while (tentativas < 12) {
                const mAct = Number(this.mesFiltro);
                const yAct = Number(this.anoFiltro);
                const temPendente = this.despesasData.some(d => {
                    if (!d.vencimento || d.status === 'Pago') return false;
                    let dt = new Date(d.vencimento);
                    let loc = new Date(dt.getTime() + dt.getTimezoneOffset() * 60000);
                    return (loc.getMonth() + 1) === mAct && loc.getFullYear() === yAct;
                });
                if (temPendente) break;
                
                this.mesFiltro = Number(this.mesFiltro) + 1;
                if(this.mesFiltro > 12) {
                    this.mesFiltro = 1;
                    this.anoFiltro = Number(this.anoFiltro) + 1;
                }
                tentativas++;
            }
        },

        mudarAba(novaAba) {
            this.checarESincronizar();
            this.tab = novaAba;
            this.buscaTermo = ''; this.filtroCategoriaGeral = ''; this.configSubAba = ''; this.aberto = false;
            if (novaAba === 'resumoDia') this.avancarParaMesComPendencias();
            this.renderizarAbaAtual();
            if (this.houveAlteracao) { this.atualizarCacheBackgroundSilencioso(); this.houveAlteracao = false; }
        },

        renderizarAbaAtual() {
            if(this.tab === 'dashboard' && !this.telaLogin) this.$nextTick(() => this.redesenharGraficosDashboard());
            if(this.tab === 'resumoAnual') this.construirGradeExcelReal();
        },

        async atualizarCacheBackgroundSilencioso() {
            try {
                const todoOrcamento = await this.chamarBackend('carregarTodoOrcamento', { ignorarLogin: true });
                if(todoOrcamento.requerLogin) return;
                this.sincronizarCacheLocal(todoOrcamento.receitas, todoOrcamento.despesas);
                if (todoOrcamento.historico && todoOrcamento.historico.length > 0) this.historicoAtividades = todoOrcamento.historico;
                if (this.tab === 'resumoAnual') this.construirGradeExcelReal();
                if (this.tab === 'dashboard') this.redesenharGraficosDashboard();
            } catch(e) {}
        },

        async salvarTemaNuvem() {
            this.carregando = true;
            try {
                await this.chamarBackend('salvarConfiguracaoPlanilha', { chave: 'tema_ativo', valor: this.temaAtivo });
                this.notificar('Tema Configurado', 'Salvo na nuvem.', 'sucesso');
            } catch(e) {}
            this.carregando = false;
        },

        async salvarSidebarModoNuvem() {
            this.carregando = true;
            try {
                await this.chamarBackend('salvarConfiguracaoPlanilha', { chave: 'sidebar_compacta', valor: String(this.sidebarCompactaUsuario) });
                localStorage.setItem('meuorc_side_comp', this.sidebarCompactaUsuario);
                this.notificar('Salvo', 'Preferencia guardada.', 'sucesso');
            } catch(e) {}
            this.carregando = false;
        },

        async salvarListagemRetratilNuvem() {
            this.carregando = true;
            try {
                await this.chamarBackend('salvarConfiguracaoPlanilha', { chave: 'listagem_retratil', valor: String(this.listagemRetratil) });
                this.notificar('Salvo', 'Comportamento da listagem atualizado.', 'sucesso');
            } catch(e) {}
            this.carregando = false;
        },

        adicionarCategoria() {
            if(this.novaCategoriaTexto.trim() !== '') { 
                this.categoriasLista.push(this.novaCategoriaTexto.trim());
                this.novaCategoriaTexto = ''; 
                this.persistirCategoriasNuvem(); 
            }
        },
        async persistirCategoriasNuvem() {
            this.carregando = true;
            try {
                await this.chamarBackend('salvarConfiguracaoPlanilha', { chave: 'categorias_json', valor: JSON.stringify(this.categoriasLista) });
                this.notificar('Sucesso', 'Categorias salvas.', 'sucesso');
            } catch(e) {}
            this.carregando = false;
        },

        adicionarFonteNoticia() {
            if(this.novaFonteNoticia.trim() !== '') { 
                this.fontesNoticias.push(this.novaFonteNoticia.trim());
                this.novaFonteNoticia = '';
                this.persistirFontesNuvem(); 
                this.gerarMockNoticias();
            }
        },
        async persistirFontesNuvem() {
            try {
                await this.chamarBackend('salvarConfiguracaoPlanilha', { chave: 'fontes_noticias_json', valor: JSON.stringify(this.fontesNoticias) });
                this.notificar('Sucesso', 'Fontes de notícias atualizadas.', 'sucesso');
            } catch(e) {}
        },
        gerarMockNoticias() {
            let manchetes = [
                "Ações da Bolsa sobem impulsionadas por resultados do setor tech",
                "Como a nova taxa Selic impacta seus investimentos",
                "Dólar tem queda expressiva em dia de otimismo global",
                "Especialistas indicam as melhores carteiras de dividendos para este mês",
                "Novas tecnologias em pagamentos digitais: o que muda para você"
            ];
            let imagens = [
                "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=80",
                "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&w=800&q=80",
                "https://images.unsplash.com/photo-1640340434855-6084b1f4901c?auto=format&fit=crop&w=800&q=80",
                "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
                "https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?auto=format&fit=crop&w=800&q=80"
            ];
            this.noticiasExibicao = [];
            for(let i=0; i<3; i++) {
                if (this.fontesNoticias.length === 0) break;
                let f = this.fontesNoticias[i % this.fontesNoticias.length];
                let m = manchetes[Math.floor(Math.random() * manchetes.length)];
                let img = imagens[Math.floor(Math.random() * imagens.length)];
                this.noticiasExibicao.push({ source: f, title: m, time: "Atualizado há " + (Math.floor(Math.random()*5)+1) + " horas", image: img, url: "#" });
            }
        },

        async adicionarUser() {
            if(this.novoUser.nome && this.novoUser.email && this.novoUser.senha) {
                const senhaProtegida = await generarSenhaProtegida(this.novoUser.senha);
                this.usuariosLista.push({ nome: this.novoUser.nome, email: this.novoUser.email, senha: senhaProtegida, nivel: this.novoUser.nivel });
                this.persistirUsuariosNuvem();
                this.novoUser = {nome:'', email:'', senha:'', nivel:'USUARIO'};
            }
        },

        async salvarPerfil() {
            this.carregando = true;
            let index = this.usuariosLista.findIndex(u => u.email === this.usuarioLogado.email && u.nome === this.usuarioLogado.nome);
            if(index !== -1) {
                this.usuariosLista[index].nome = this.perfilEdit.nome;
                this.usuariosLista[index].email = this.perfilEdit.email;
                if(this.perfilEdit.senha) {
                    this.usuariosLista[index].senha = await generarSenhaProtegida(this.perfilEdit.senha);
                }
                this.usuarioLogado.nome = this.perfilEdit.nome;
                this.usuarioLogado.email = this.perfilEdit.email;
                this.persistirUsuariosNuvem();
                this.perfilEdit.senha = ''; 
                this.notificar('Perfil Atualizado', 'Seus dados foram atualizados com sucesso.', 'sucesso');
            } else {
                this.carregando = false;
                this.notificar('Erro', 'Sua conta não foi encontrada na base de dados.', 'erro');
            }
        },

        async persistirUsuariosNuvem() {
            this.carregando = true;
            try {
                await this.chamarBackend('salvarConfiguracaoPlanilha', { chave: 'usuarios_json', valor: JSON.stringify(this.usuariosLista) });
                this.notificar('Usuários Atualizados', 'Banco de credenciais seguras sincronizado.', 'sucesso');
            } catch(e) {}
            this.carregando = false;
        },

        abrirModalPagarResumo(item) {
            this.modalPagar.item = item;
            this.modalPagar.novoValor = item.valor;
            this.modalPagar.aberto = true;
        },

        confirmarPagamentoResumo(atualizarValor = false) {
            if(!this.modalPagar.item) return;
            if(atualizarValor && this.modalPagar.novoValor !== undefined) {
                this.modalPagar.item.valor = this.modalPagar.novoValor;
            }
            this.alternarStatusPagamento(this.modalPagar.item);
            this.modalPagar.aberto = false;
        },

        async alternarStatusPagamento(item) {
            this.carregando = true;
            const novoStatus = item.status === 'Pago' ? 'Pendente' : 'Pago';
            const novaDataPag = item.status === 'Pago' ? '' : new Date().toLocaleDateString('en-CA'); 

            const idx = this.despesasData.findIndex(i => i.linha === item.linha);
            if (idx !== -1) { 
                this.despesasData[idx].status = novoStatus;
                this.despesasData[idx].datapag = novaDataPag; 
            }
            this.sincronizarCacheLocal(this.receitasData, this.despesasData);
            const payload = [item.id, item.desc, item.categoria || '', Number(item.valor), item.vencimento || '', novaDataPag, novoStatus, item.tipo, item.obs || ''];
            
            try {
                await this.chamarBackend('salvarItemPlanilha', { aba: 'despesas', dados: payload, linha: item.linha });
                await this.registrarHistorico('Status de Pagamento', `Item ${item.desc} alterado para ${novoStatus}.`);
                this.notificar('Sucesso', `Alterado para ${novoStatus}.`, 'sucesso'); 
                this.atualizarCacheBackground(); 
            } catch(e) {}
            this.carregando = false;
        },

        async salvar() {
            this.processarValorInput();
            if (!this.novoItem.desc || !this.novoItem.valor) {
                this.notificar('Aviso', 'Preencha a Descrição e o Valor (R$).', 'erro');
                return;
            }
            if (!this.novoItem.id) this.novoItem.id = this.gerarProximoId();
            const itemTemporario = { ...this.novoItem };
            let listaAlvo = this.tab === 'receitas' ? this.receitasData : this.despesasData;
            
            let ehEdicao = false;
            if (!itemTemporario.linha) { 
                itemTemporario.linha = "temp_" + Date.now();
                listaAlvo.push(itemTemporario); 
            } else { 
                ehEdicao = true;
                const idx = listaAlvo.findIndex(i => i.linha === itemTemporario.linha); 
                if (idx !== -1) listaAlvo[idx] = itemTemporario;
            }
            this.sincronizarCacheLocal(this.receitasData, this.despesasData);
            this.aberto = false; 
            this.carregando = true;

            let payload = [];
            if (this.tab === 'receitas') payload = [itemTemporario.id, itemTemporario.desc, Number(itemTemporario.valor), itemTemporario.datareceb || '', itemTemporario.obs || ''];
            else payload = [itemTemporario.id, itemTemporario.desc, itemTemporario.categoria || '', Number(itemTemporario.valor), itemTemporario.vencimento || '', itemTemporario.datapag || '', itemTemporario.status, itemTemporario.tipo, itemTemporario.obs || ''];
            
            const linhaEnvio = String(itemTemporario.linha).startsWith("temp_") ? null : itemTemporario.linha;
            try {
                await this.chamarBackend('salvarItemPlanilha', { aba: this.tab, dados: payload, linha: linhaEnvio });
                await this.registrarHistorico(ehEdicao ? 'Edição' : 'Novo Cadastro', `Aba: ${this.tab.toUpperCase()} | Descrição: ${itemTemporario.desc} | Valor: R$${itemTemporario.valor}`);
                this.notificar('Sucesso!', 'Dados gravados na nuvem.', 'sucesso'); 
                this.atualizarCacheBackground(); 
            } catch(e) {}
            this.carregando = false;
        },

        editarItem(item) {
            this.novoItem = { ...item };
            this.novoItem.valorDisplay = this.formatarMoeda(item.valor);
            if(this.novoItem.datareceb) this.novoItem.datareceb = this.formatarParaInputDate(this.novoItem.datareceb);
            if(this.novoItem.vencimento) this.novoItem.vencimento = this.formatarParaInputDate(this.novoItem.vencimento);
            if(this.novoItem.datapag) this.novoItem.datapag = this.formatarParaInputDate(this.novoItem.datapag);
            this.aberto = true;
            this.$nextTick(() => { const el = document.getElementById('formularioOrcamento'); if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        },

        excluirItem(item) { 
            this.modalExcluir.itemDesc = item.desc;
            this.modalExcluir.itemLinha = item.linha;
            this.modalExcluir.aberto = true; 
        },
        
        async confirmarExclusao() {
            const linha = this.modalExcluir.itemLinha;
            this.modalExcluir.aberto = false; 
            const cacheOld = this.tab === 'receitas' ? this.receitasData : this.despesasData;
            const itemDel = cacheOld.find(i => i.linha === linha);

            if (this.tab === 'receitas') this.receitasData = this.receitasData.filter(i => i.linha !== linha);
            else this.despesasData = this.despesasData.filter(i => i.linha !== linha);
            
            this.sincronizarCacheLocal(this.receitasData, this.despesasData);
            this.carregando = true;
            try {
                await this.chamarBackend('excluirItemPlanilha', { aba: this.tab, linha: linha });
                if(itemDel) await this.registrarHistorico('Exclusão Física', `Aba: ${this.tab.toUpperCase()} | Deletado item: ${itemDel.desc}`);
                this.notificar('Removido', 'Registro excluído.', 'sucesso'); 
                this.atualizarCacheBackground(); 
            } catch(e) {}
            this.carregando = false;
        },

        async atualizarCacheBackground() {
            try {
                const todoOrcamento = await this.chamarBackend('carregarTodoOrcamento', { ignorarLogin: true });
                if(todoOrcamento.requerLogin) return;
                this.sincronizarCacheLocal(todoOrcamento.receitas, todoOrcamento.despesas);
                this.renderizarAbaAtual();
            } catch(e) {}
        },

        redesenharGraficosDashboard() { 
            this.atualizarGraficoSaldosTotais();
            this.atualizarGraficoDonutAnual();
            this.atualizarGraficoDonutReceitas();
        },

        atualizarGraficoSaldosTotais() {
            const ctx = document.getElementById('graficoSaldosTotais');
            if(!ctx) return;
            if(this.chartSaldosInstance) this.chartSaldosInstance.destroy();
            
            const { receitas, despesas, saldo } = this.totaisDashboard;
            const isDark = this.darkMode;
            let labels = ['Receitas', 'Despesas', saldo >= 0 ? 'Saldo Restante' : 'Déficit'];
            let dataValues = [receitas, despesas, Math.abs(saldo)];
            let colors = ['#3b82f6', '#f43f5e', saldo >= 0 ? '#10b981' : '#f97316'];
            if(this.temaAtivo === 'premium'){ colors = ['#7a8c44', '#f43f5e', saldo >= 0 ? '#10b981' : '#f97316']; }
            this.chartSaldosInstance = new Chart(ctx, {
                type: 'bar',
                data: { labels: labels, datasets: [{ data: dataValues, backgroundColor: colors, borderRadius: 6, barThickness: 32 }] },
                options: {
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                    scales: { x: { grid: { color: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9' }, ticks: { color: isDark ? '#9ca3af' : '#64748b' } }, y: { grid: { display: false }, ticks: { color: isDark ? '#f8fafc' : '#0f172a', font: { weight: 'bold' } } } }
                }
            });
        },

        atualizarGraficoDonutAnual() {
            const ctx = document.getElementById('graficoCategoriaPizza');
            if(!ctx) return;
            if(this.chartPizzaInstance) this.chartPizzaInstance.destroy();
            const catMap = {};

            this.despesasData.forEach(i => { if(!i.vencimento) return; let loc = new Date(new Date(i.vencimento).getTime() + new Date(i.vencimento).getTimezoneOffset() * 60000); if(loc.getFullYear() === Number(this.anoFiltro)) { const c = i.categoria || 'Geral'; catMap[c] = (catMap[c] || 0) + Number(i.valor || 0); } });
            const labels = Object.keys(catMap); const dados = Object.values(catMap);
            if(labels.length === 0) { labels.push('Sem Lançamentos'); dados.push(1); }

            this.chartPizzaInstance = new Chart(ctx, { type: 'doughnut', data: { labels: labels, datasets: [{ data: dados, backgroundColor: ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#ec4899', '#e2e8f0'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, color: this.darkMode ? '#9ca3af' : '#4b5563', font: { size: 10 } } } } } });
        },

        atualizarGraficoDonutReceitas() {
            const ctx = document.getElementById('graficoReceitaPizza');
            if(!ctx) return;
            if(this.chartReceitaPizzaInstance) this.chartReceitaPizzaInstance.destroy();
            const fonteMap = {};

            this.receitasData.forEach(i => { if(!i.datareceb) return; let loc = new Date(new Date(i.datareceb).getTime() + new Date(i.datareceb).getTimezoneOffset() * 60000); if(loc.getFullYear() === Number(this.anoFiltro)) { const c = i.desc || 'Outras'; fonteMap[c] = (fonteMap[c] || 0) + Number(i.valor || 0); } });
            const labels = Object.keys(fonteMap); const dados = Object.values(fonteMap);
            if(labels.length === 0) { labels.push('Sem Receitas'); dados.push(1); }

            let palette = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4', '#e2e8f0'];
            if(this.temaAtivo === 'premium') palette = ['#7a8c44', '#57662d', '#a4b568', '#f59e0b', '#06b6d4', '#e2e8f0'];
            this.chartReceitaPizzaInstance = new Chart(ctx, { type: 'doughnut', data: { labels: labels, datasets: [{ data: dados, backgroundColor: palette, borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, color: this.darkMode ? '#9ca3af' : '#4b5563', font: { size: 10 } } } } } });
        },

        formatarMoeda(v) { if(!v) return 'R$ 0,00'; return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); },
        formatarData(d) { if (!d) return '-'; let dataStr = String(d).split('T')[0]; let partes = dataStr.split('-'); if(partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`; let data = new Date(d); if (isNaN(data.getTime())) return d; return new Date(data.getTime() + data.getTimezoneOffset() * 60000).toLocaleDateString('pt-BR'); },
        formatarParaInputDate(d) { if (!d) return ''; let data = new Date(d); if (isNaN(data.getTime())) return ''; let localData = new Date(data.getTime() + data.getTimezoneOffset() * 60000); return localData.toISOString().split('T')[0]; }
    }
}
