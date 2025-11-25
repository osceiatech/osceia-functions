# osceia-functions

Este repositório contém as Cloud Functions do Firebase responsáveis pela sincronização de usuários com o Twenty CRM e a definição de Custom Claims para controle de acesso no frontend.

## Funções Implementadas

| Função | Tipo | Gatilho | Descrição |
| :--- | :--- | :--- | :--- |
| `syncUserOnCreate` | `auth.user().onCreate` | Criação de Usuário | Dispara automaticamente quando um novo usuário é criado no Firebase Auth. |
| `syncUserWithTwentyCallable` | `https.onCall` | Chamada pelo Frontend | Pode ser chamada explicitamente pelo frontend (após login) para forçar a sincronização e revalidação dos Custom Claims. |

Ambas as funções executam a mesma lógica de sincronização:
1. Busca o usuário no Twenty CRM pelo e-mail.
2. Se **encontrar**, define os claims `hasProfile: true` e `twentyPersonId: <id>`.
3. Se **NÃO encontrar**, define o claim `hasProfile: false` (conforme regra de negócio definida).

## Pré-requisitos

Para configurar e fazer o deploy das funções, você precisa ter:

1.  **Node.js** (versão 18 ou superior)
2.  **Firebase CLI** instalado e configurado:
    ```bash
    npm install -g firebase-tools
    firebase login
    firebase use <SEU_PROJECT_ID>
    ```

## Configuração

### 1. Instalação de Dependências

Navegue até o diretório do projeto e instale as dependências:

```bash
cd osceia-functions
npm install
```

### 2. Configuração da Variável Secreta (Twenty CRM Token)

O token de acesso à API do Twenty CRM deve ser configurado como uma variável de ambiente secreta no Firebase Functions para garantir a segurança.

Substitua `<SEU_TOKEN_AQUI>` pelo seu token real:

```bash
firebase functions:config:set twenty.token="<SEU_TOKEN_AQUI>"
```

> **Observação:** A função `syncUserWithTwentyCallable` usa o `context.auth` para obter o `uid` e `email` do usuário autenticado, garantindo que apenas usuários logados possam chamar a função.

## Deploy

Após a configuração, você pode compilar o código TypeScript e fazer o deploy das funções:

1.  **Compilar o TypeScript:**
    ```bash
    npm run build
    ```
2.  **Fazer o Deploy das Funções:**
    ```bash
    firebase deploy --only functions
    ```

## Teste Local (Opcional)

Para testar as funções localmente, você pode usar o Firebase Emulators:

```bash
npm run serve
```

Isso iniciará os emuladores de Functions e Auth, permitindo que você teste a lógica de sincronização antes de fazer o deploy em produção.
