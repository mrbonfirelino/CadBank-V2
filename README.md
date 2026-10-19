# 📐 CadBank V2 — Organizador de Desenhos CAD

Aplicativo web para catalogar, versionar, visualizar e distribuir desenhos CAD (DWG/DXF).
Funciona **localmente** na máquina do usuário (`http://localhost:3000`) ou instalado em um **servidor** da rede local (`http://servidor:3000`) — é o mesmo aplicativo.

## Recursos

- **Slots de desenho** com campos: código, nome, descrição, desenhista, projetista, empresa (cliente), planta, OS, anotações
- **Revisões versionadas** — nova revisão nunca sobrescreve as antigas
- **Busca simples** (texto livre em todos os campos) e **avançada** (N critérios combinados + filtro "com/sem anexo")
- **Badge** nos slots com desenho anexado e marcação de PDF disponível
- **Visualizador DWG no navegador** (mlightcad/cad-viewer — 100% local, sem nuvem)
- **Plotar em PDF** (botão manual + conversão automática em background via ODA File Converter)
- **Download** de DWG ou PDF por revisão
- **Comentários** por desenho (com usuário e data)
- **Importação em lote** (zip de DWGs + meta.csv) e **exportação em lote** (zip de DWGs ou PDFs)
- **Login com perfis**: admin (tudo), editor (leitura + escrita), visualizador (somente leitura)
- **Backup**: manual, agendado (cron), exportação (.zip) e restauração

## Requisitos

- Windows com o Node.js portátil incluído na pasta `.tools` (nada mais é preciso instalar)
- **Opcional** — para conversão DWG→PDF: baixe o [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter) (gratuito) e aponte o caminho do `ODAFileConverter.exe` em *Administração → Configurações*

## Como rodar

1. Dê dois cliques em **`start.bat`**
2. Abra `http://localhost:3000` (ou `http://IP-DO-SERVIDOR:3000` de outra máquina da rede)
3. Login padrão: **admin / admin123** (troque a senha em seguida!)

> No primeiro acesso a pasta `server/data` é criada automaticamente com o banco SQLite e o admin padrão.

## Estrutura

```
CadBank V2/
├── start.bat              # inicia tudo
├── .tools/                # Node.js portátil
├── server/                # API (Express + SQLite)
│   └── data/              # criado em runtime: banco, arquivos, backups
│       ├── cadbank.db
│       ├── files/<drawing>/<revisao>/
│       └── backups/       # zips de backup (mantém 20)
└── web/                   # frontend (React + Vite)
```

## Backup e restauração

- **Manual:** Administração → Backup → "Criar backup agora"
- **Automático:** Administração → Configurações → expressão cron (ex.: `0 3 * * *` = todo dia 03:00)
- **Exportar:** baixe o .zip da lista de backups
- **Restaurar:** botão "Restaurar" — aplica ao reiniciar o servidor

## Importação em lote

Zip com os DWGs na raiz; o **nome do arquivo vira o código do slot**. Opcionalmente inclua `meta.csv`:

```
codigo;nome;descricao;desenhista;projetista;empresa;planta;os;anotacoes
EX-001;Planta Baixa;PB térreo;João;Maria;Cliente X;Planta 1;OS-123;
```

(Modelo disponível em *Lote → Baixar modelo do meta.csv*)

## Desenvolvimento

```bat
:: backend (porta 3000)
cd server && npm install && npm run dev

:: frontend (porta 5173, com proxy /api → 3000)
cd web && npm install && npm run dev
```

Para produção, `cd web && npm run build` — o Express serve o `web/dist` automaticamente.

## Segurança / licenças

- Senhas com bcrypt; sessões JWT (12h); arquivos só acessíveis autenticado
- Parser DWG do viewer usa **LibreDWG (GPL-3.0)** — OK para uso interno; se o produto for distribuído comercialmente a terceiros, considere o parser proprietário do mlightcad
