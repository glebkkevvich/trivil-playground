package com.trivil.playground.service;

import com.trivil.playground.config.TrivilCompilerProperties;
import com.trivil.playground.dto.SyntaxAnalysisRequest;
import com.trivil.playground.dto.SyntaxAnalysisResponse;
import com.trivil.playground.dto.SyntaxToken;
import com.trivil.playground.dto.SyntaxToken.TokenType;
import com.trivil.playground.exception.CompilationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.HashSet;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Future;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import org.springframework.beans.factory.DisposableBean;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

@Service
public class TrivilSyntaxAnalysisService implements DisposableBean {

    private static final Logger logger = LoggerFactory.getLogger(TrivilSyntaxAnalysisService.class);

    private static final Set<String> TRIVIL_KEYWORDS = Set.of(
            "модуль", "импорт", "вход", "пусть", "если", "иначе", "пока", "для",
            "фн", "функция", "класс", "тип", "константа", "переменная", "возврат", "вернуть", "прервать",
            "продолжить", "выбор", "случай", "умолчание", "и", "или", "не", "истина", "ложь");

    private static final Set<String> BUILT_IN_TYPES = Set.of(
            "Цел64", "Слово64", "Вещ64", "Лог", "Строка", "Символ", "Байт", "Пусто");

    private static final Set<String> BUILT_IN_FUNCTIONS = Set.of();

    private final TrivilCompilerProperties properties;

    private final Pattern COMMENT_PATTERN = Pattern.compile("//.*$", Pattern.MULTILINE);
    private final Pattern STRING_PATTERN = Pattern.compile("\"(?:[^\"\\\\]|\\\\.)*\"");
    private final Pattern NUMBER_PATTERN = Pattern.compile("\\b\\d+(?:\\.\\d+)?\\b");
    private final Pattern IDENTIFIER_PATTERN = Pattern.compile("[а-яёА-ЯЁa-zA-Z_][а-яёА-ЯЁa-zA-Z0-9_-]*");
    private final Pattern OPERATOR_PATTERN = Pattern.compile("[+\\-*/=<>!&|^%:;,.()\\[\\]{}]");

    private final Map<String, Process> activeProcesses = new ConcurrentHashMap<>();
    private final AtomicLong processCounter = new AtomicLong(0);
    private final ScheduledExecutorService cleanupExecutor = Executors.newSingleThreadScheduledExecutor();

    public TrivilSyntaxAnalysisService(TrivilCompilerProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    public void init() {
        logger.info("Initializing TrivilSyntaxAnalysisService with process management");

        killExistingTrivilProcesses();

        cleanupExecutor.scheduleAtFixedRate(
                this::cleanupZombieProcesses,
                120,
                120,
                TimeUnit.SECONDS);

        logger.info("TrivilSyntaxAnalysisService initialized with periodic cleanup");
    }

    @PreDestroy
    @Override
    public void destroy() throws Exception {
        logger.info("Shutting down TrivilSyntaxAnalysisService");

        cleanupExecutor.shutdown();
        try {
            if (!cleanupExecutor.awaitTermination(10, TimeUnit.SECONDS)) {
                cleanupExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            cleanupExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }

        killAllActiveProcesses();

        logger.info("TrivilSyntaxAnalysisService shutdown complete");
    }

    private void killExistingTrivilProcesses() {
        try {
            logger.info("Checking for existing trivil processes...");

            ProcessBuilder pb = new ProcessBuilder("pgrep", "-f", "trivil.*-ast");
            Process proc = pb.start();

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(proc.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    try {
                        int pid = Integer.parseInt(line.trim());
                        logger.warn("Found existing trivil process PID: {}, attempting to kill it", pid);

                        ProcessBuilder killPb = new ProcessBuilder("kill", "-9", String.valueOf(pid));
                        Process killProc = killPb.start();
                        killProc.waitFor(5, TimeUnit.SECONDS);

                        logger.info("Killed existing trivil process PID: {}", pid);
                    } catch (NumberFormatException e) {
                        logger.warn("Invalid PID format: {}", line);
                    } catch (Exception e) {
                        logger.warn("Failed to kill process {}: {}", line, e.getMessage());
                    }
                }
            }

            proc.waitFor(10, TimeUnit.SECONDS);
        } catch (Exception e) {
            logger.warn("Failed to check for existing trivil processes: {}", e.getMessage());
        }
    }

    private void killAllActiveProcesses() {
        logger.info("Killing {} active processes", activeProcesses.size());

        activeProcesses.values().parallelStream().forEach(process -> {
            try {
                if (process.isAlive()) {
                    process.destroyForcibly();
                    process.waitFor(2, TimeUnit.SECONDS);
                }
            } catch (Exception e) {
                logger.warn("Failed to kill process: {}", e.getMessage());
            }
        });

        activeProcesses.clear();
    }

    public SyntaxAnalysisResponse analyzeSyntax(SyntaxAnalysisRequest request) {
        long startTime = System.currentTimeMillis();

        try {
            logger.info("=== Starting syntax analysis for {} characters of code ===",
                    request.sourceCode().length());

            String userCode = sanitizeInput(request.sourceCode());
            logger.info("Sanitized user code: {}", userCode);

            List<SyntaxToken> tokens = performStaticLexicalAnalysis(userCode);
            logger.info("Static analysis produced {} tokens", tokens.size());

            try {

                Path baseTempDir = Path.of(properties.tempDirectory());
                logger.info("Base temp directory: {}", baseTempDir.toAbsolutePath());
                Files.createDirectories(baseTempDir);

                String sessionId = UUID.randomUUID().toString();
                Path isolatedDir = baseTempDir.resolve("session_" + sessionId);
                Files.createDirectories(isolatedDir);
                logger.info("Created isolated directory: {}", isolatedDir.toAbsolutePath());

                String fileName = "main.tri";
                Path sourceFile = isolatedDir.resolve(fileName);

                try {

                    String wrappedCode = wrapInTrivilModule(userCode);
                    logger.info("Wrapped code: {}", wrappedCode);

                    Files.writeString(sourceFile, wrappedCode);
                    logger.info("Written source file: {}", sourceFile.toAbsolutePath());

                    try {

                        String astOutput = runCompilerToolSafely(sourceFile, "-ast", "2");
                        Map<String, String> semanticInfo = new HashMap<>();
                        parseASTForSemanticInfo(astOutput, semanticInfo);
                        enhanceTokensWithSemanticInfo(tokens, semanticInfo);
                        logger.info("Enhanced {} static tokens with {} semantic entries", tokens.size(),
                                semanticInfo.size());
                    } catch (Exception semanticError) {
                        logger.warn("Semantic enhancement failed, using static tokens only: {}",
                                semanticError.getMessage());
                    }

                } finally {

                    cleanupDirectory(isolatedDir);
                }

            } catch (Exception e) {
                logger.warn("Semantic analysis failed, using static analysis only: {}", e.getMessage());
            }

            logger.info("=== FINAL TOKEN MAPPING ===");
            for (int i = 0; i < tokens.size(); i++) {
                SyntaxToken token = tokens.get(i);
                logger.info("Token {}: '{}' -> {} at [{}:{}-{}:{}]",
                        i,
                        token.value(),
                        token.tokenType(),
                        token.startLine(),
                        token.startColumn(),
                        token.endLine(),
                        token.endColumn());
            }
            logger.info("=== END TOKEN MAPPING ===");

            long analysisTime = System.currentTimeMillis() - startTime;
            logger.info("=== Syntax analysis completed in {}ms with {} tokens ===",
                    analysisTime, tokens.size());

            return SyntaxAnalysisResponse.success(tokens, analysisTime);

        } catch (Exception e) {
            long analysisTime = System.currentTimeMillis() - startTime;
            logger.error("Syntax analysis failed", e);
            return SyntaxAnalysisResponse.error(
                    "Syntax analysis failed: " + e.getMessage(),
                    analysisTime);
        }
    }

    private String wrapInTrivilModule(String userCode) {

        if (userCode.trim().startsWith("модуль ")) {
            return userCode;
        }

        StringBuilder sb = new StringBuilder();

        String moduleName = "sample_" + System.currentTimeMillis() % 10000;
        sb.append("модуль ").append(moduleName).append("\n\n");

        if (userCode.contains("вывод")) {
            sb.append("импорт \"стд::вывод\"\n\n");
        }
        if (userCode.contains("ввод")) {
            sb.append("импорт \"стд::ввод\"\n\n");
        }
        if (userCode.contains("файл")) {
            sb.append("импорт \"стд::файл\"\n\n");
        }

        sb.append(userCode);

        return sb.toString();
    }

    private static class ProcessManager {
        private final Process process;
        private final String processId;
        private final long startTime;
        private Future<String> outputReader;

        public ProcessManager(Process process, String processId) {
            this.process = process;
            this.processId = processId;
            this.startTime = System.currentTimeMillis();
        }

        public void setOutputReader(Future<String> outputReader) {
            this.outputReader = outputReader;
        }

        public boolean isAlive() {
            return process.isAlive();
        }

        public void destroyForcibly() {
            try {
                if (outputReader != null) {
                    outputReader.cancel(true);
                }
                if (process.isAlive()) {
                    logger.warn("Force killing stuck process {}", processId);
                    process.destroyForcibly();

                    try {
                        process.waitFor(2, TimeUnit.SECONDS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                }
            } catch (Exception e) {
                logger.error("Error while destroying process {}: {}", processId, e.getMessage());
            }
        }

        public long getRuntime() {
            return System.currentTimeMillis() - startTime;
        }
    }

    private String runCompilerToolSafely(Path sourceFile, String... args) throws CompilationException {
        String processId = "compiler-" + processCounter.incrementAndGet();
        ProcessManager processManager = null;

        try {
            String compilerPath = properties.compilerPath();

            File currentDir = new File(".").getAbsoluteFile();
            File compilerFile = new File(compilerPath).getAbsoluteFile();
            logger.info("Current working directory: {}", currentDir);
            logger.info("Compiler path: {} -> {}", compilerPath, compilerFile);
            logger.info("Compiler exists: {}", compilerFile.exists());
            logger.info("Compiler executable: {}", compilerFile.canExecute());

            List<String> command = new ArrayList<>();
            command.add(compilerFile.toString());
            command.addAll(Arrays.asList(args));
            command.add(sourceFile.toString());

            logger.info("Executing command: {}", String.join(" ", command));

            ProcessBuilder processBuilder = new ProcessBuilder(command);
            processBuilder.redirectErrorStream(true);

            Process process = processBuilder.start();
            processManager = new ProcessManager(process, processId);

            activeProcesses.put(processId, process);

            CompletableFuture<String> outputFuture = CompletableFuture.supplyAsync(() -> {
                try {
                    return new String(process.getInputStream().readAllBytes());
                } catch (IOException e) {
                    logger.error("Failed to read process output for {}: {}", processId, e.getMessage());
                    return "";
                }
            });
            processManager.setOutputReader(outputFuture);

            boolean finished = process.waitFor(properties.compilationTimeoutMs(), TimeUnit.MILLISECONDS);

            if (!finished) {
                logger.warn("Process {} timed out after {}ms, force killing", processId,
                        properties.compilationTimeoutMs());
                processManager.destroyForcibly();

                cleanupZombieProcesses();

                throw new CompilationException(
                        "Compiler tool timed out after " + properties.compilationTimeoutMs() + "ms");
            }

            String output;
            try {
                output = outputFuture.get(5, TimeUnit.SECONDS);
            } catch (Exception e) {
                logger.warn("Failed to get output for process {}: {}", processId, e.getMessage());
                output = "";
            }

            int exitCode = process.exitValue();

            if (exitCode != 0) {
                logger.warn("Compiler tool exited with code {}, but still returning output for analysis", exitCode);
                logger.debug("Compiler output: {}", output);
            }

            logger.info("Process {} completed successfully in {}ms", processId, processManager.getRuntime());

            return output;

        } catch (IOException | InterruptedException e) {
            if (processManager != null) {
                processManager.destroyForcibly();
            }
            Thread.currentThread().interrupt();
            throw new CompilationException("Failed to run compiler tool: " + e.getMessage(), e);
        } finally {

            activeProcesses.remove(processId);
            if (processManager != null && processManager.isAlive()) {
                processManager.destroyForcibly();
            }
        }
    }

    private void cleanupZombieProcesses() {
        logger.info("Cleaning up zombie processes...");

        activeProcesses.entrySet().removeIf(entry -> {
            String pid = entry.getKey();
            Process process = entry.getValue();

            if (!process.isAlive()) {
                logger.debug("Removing dead process: {}", pid);
                return true;
            }

            try {
                boolean finished = process.waitFor(0, TimeUnit.NANOSECONDS);
                if (!finished) {
                    logger.warn("Force killing long-running process: {}", pid);
                    process.destroyForcibly();
                    process.waitFor(2, TimeUnit.SECONDS);
                    return true;
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                logger.warn("Interrupted while cleaning up process: {}", pid);
                process.destroyForcibly();
                return true;
            }

            return false;
        });

        logger.info("Active processes after cleanup: {}", activeProcesses.size());
    }

    private List<SyntaxToken> performStaticLexicalAnalysis(String sourceCode) {
        List<SyntaxToken> tokens = new ArrayList<>();
        String[] lines = sourceCode.split("\n");

        Set<String> allFunctionNames = new HashSet<>();
        Set<String> allParameterNames = new HashSet<>();
        Set<String> allVariableNames = new HashSet<>();

        for (String line : lines) {
            extractFunctionNamesAndParameters(line, allFunctionNames, allParameterNames);
        }

        allVariableNames = extractVariableNames(lines);

        logger.info(">>> Multi-line analysis: Functions: {}, Parameters: {}, Variables: {}",
                allFunctionNames, allParameterNames, allVariableNames);

        for (int lineNum = 0; lineNum < lines.length; lineNum++) {
            String line = lines[lineNum];
            tokens.addAll(analyzeLineTokensWithGlobalContext(line, lineNum, allFunctionNames, allParameterNames,
                    allVariableNames));
        }

        return tokens;
    }

    private void extractFunctionNamesAndParameters(String line, Set<String> functionNames, Set<String> parameterNames) {

        Pattern functionPattern = Pattern.compile("фн\\s+([а-яёА-ЯЁa-zA-Z_][а-яёА-ЯЁa-zA-Z0-9_-]*)\\s*\\(");
        Matcher functionMatcher = functionPattern.matcher(line);

        while (functionMatcher.find()) {
            String functionName = functionMatcher.group(1);
            functionNames.add(functionName);
            logger.debug(">>> Global function found: '{}'", functionName);
        }

        Pattern paramPattern = Pattern.compile("\\(([^)]+)\\)");
        Matcher paramMatcher = paramPattern.matcher(line);

        while (paramMatcher.find()) {
            String paramSection = paramMatcher.group(1);
            Pattern individualParamPattern = Pattern.compile("([а-яёА-ЯЁa-zA-Z_][а-яёА-ЯЁa-zA-Z0-9_-]*)\\s*:");
            Matcher individualParamMatcher = individualParamPattern.matcher(paramSection);

            while (individualParamMatcher.find()) {
                String paramName = individualParamMatcher.group(1);
                parameterNames.add(paramName);
                logger.debug(">>> Global parameter found: '{}'", paramName);
            }
        }
    }

    private Set<String> extractVariableNames(String[] lines) {
        Set<String> variableNames = new HashSet<>();

        for (String line : lines) {

            Pattern letPattern = Pattern.compile("пусть\\s+([а-яёА-ЯЁa-zA-Z_][а-яёА-ЯЁa-zA-Z0-9_-]*)\\s*=");
            Matcher letMatcher = letPattern.matcher(line);

            while (letMatcher.find()) {
                String variableName = letMatcher.group(1);
                variableNames.add(variableName);
                logger.debug(">>> Global variable declaration found: '{}'", variableName);
            }

            Pattern assignPattern = Pattern.compile("([а-яёА-ЯЁa-zA-Z_][а-яёА-ЯЁa-zA-Z0-9_-]*)\\s*=\\s*[^=]");
            Matcher assignMatcher = assignPattern.matcher(line);

            while (assignMatcher.find()) {
                String variableName = assignMatcher.group(1);

                if (!TRIVIL_KEYWORDS.contains(variableName) && !BUILT_IN_TYPES.contains(variableName)) {
                    variableNames.add(variableName);
                    logger.debug(">>> Global variable assignment found: '{}'", variableName);
                }
            }
        }

        return variableNames;
    }

    private List<SyntaxToken> analyzeLineTokensWithGlobalContext(String line, int lineNum,
            Set<String> globalFunctionNames, Set<String> globalParameterNames, Set<String> globalVariableNames) {
        List<SyntaxToken> lineTokens = new ArrayList<>();

        Matcher commentMatcher = COMMENT_PATTERN.matcher(line);
        if (commentMatcher.find()) {
            lineTokens.add(new SyntaxToken(
                    lineNum, commentMatcher.start(), lineNum, line.length(),
                    TokenType.COMMENT.name(), commentMatcher.group(), null));

            line = line.substring(0, commentMatcher.start());
        }

        Matcher stringMatcher = STRING_PATTERN.matcher(line);
        List<int[]> stringRanges = new ArrayList<>();
        while (stringMatcher.find()) {
            stringRanges.add(new int[] { stringMatcher.start(), stringMatcher.end() });
            lineTokens.add(new SyntaxToken(
                    lineNum, stringMatcher.start(), lineNum, stringMatcher.end(),
                    TokenType.STRING_LITERAL.name(), stringMatcher.group(), null));
        }

        Matcher numberMatcher = NUMBER_PATTERN.matcher(line);
        while (numberMatcher.find()) {
            if (!isInStringLiteral(numberMatcher.start(), stringRanges)) {
                lineTokens.add(new SyntaxToken(
                        lineNum, numberMatcher.start(), lineNum, numberMatcher.end(),
                        TokenType.NUMBER_LITERAL.name(), numberMatcher.group(), null));
            }
        }

        analyzeGlobalContextAwareIdentifiers(line, lineNum, lineTokens, stringRanges, globalFunctionNames,
                globalParameterNames, globalVariableNames);

        Matcher operatorMatcher = OPERATOR_PATTERN.matcher(line);
        while (operatorMatcher.find()) {
            if (!isInStringLiteral(operatorMatcher.start(), stringRanges)) {
                lineTokens.add(new SyntaxToken(
                        lineNum, operatorMatcher.start(), lineNum, operatorMatcher.end(),
                        TokenType.OPERATOR.name(), operatorMatcher.group(), null));
            }
        }

        return lineTokens;
    }

    private void analyzeGlobalContextAwareIdentifiers(String line, int lineNum, List<SyntaxToken> lineTokens,
            List<int[]> stringRanges, Set<String> globalFunctionNames, Set<String> globalParameterNames,
            Set<String> globalVariableNames) {

        Set<String> localFunctionNames = new HashSet<>();
        Set<String> localParameterNames = new HashSet<>();

        Pattern functionPattern = Pattern.compile("фн\\s+([а-яёА-ЯЁa-zA-Z_][а-яёА-ЯЁa-zA-Z0-9_-]*)\\s*\\(");
        Matcher functionMatcher = functionPattern.matcher(line);

        while (functionMatcher.find()) {
            String functionName = functionMatcher.group(1);
            localFunctionNames.add(functionName);
        }

        Pattern paramPattern = Pattern.compile("\\(([^)]+)\\)");
        Matcher paramMatcher = paramPattern.matcher(line);

        while (paramMatcher.find()) {
            String paramSection = paramMatcher.group(1);
            Pattern individualParamPattern = Pattern.compile("([а-яёА-ЯЁa-zA-Z_][а-яёА-ЯЁa-zA-Z0-9_-]*)\\s*:");
            Matcher individualParamMatcher = individualParamPattern.matcher(paramSection);

            while (individualParamMatcher.find()) {
                String paramName = individualParamMatcher.group(1);
                localParameterNames.add(paramName);
            }
        }

        Set<String> functionCalls = new HashSet<>();
        Pattern functionCallPattern = Pattern.compile("([а-яёА-ЯЁa-zA-Z_][а-яёА-ЯЁa-zA-Z0-9_-]*)\\s*\\(");
        Matcher functionCallMatcher = functionCallPattern.matcher(line);

        while (functionCallMatcher.find()) {
            String potentialFunction = functionCallMatcher.group(1);

            if (globalFunctionNames.contains(potentialFunction) || localFunctionNames.contains(potentialFunction)) {
                functionCalls.add(potentialFunction);
                logger.info(">>> Detected function call: '{}' on line {}", potentialFunction, lineNum);
            }
        }

        Matcher identifierMatcher = IDENTIFIER_PATTERN.matcher(line);
        while (identifierMatcher.find()) {
            if (!isInStringLiteral(identifierMatcher.start(), stringRanges)) {
                String token = identifierMatcher.group();
                String tokenType;

                if (localFunctionNames.contains(token) || globalFunctionNames.contains(token)
                        || functionCalls.contains(token)) {
                    tokenType = "function.user";
                    logger.info(">>> Classifying '{}' as function.user (line {})", token, lineNum);
                } else if (localParameterNames.contains(token) || globalParameterNames.contains(token)) {
                    tokenType = "variable.parameter";
                    logger.info(">>> Classifying '{}' as variable.parameter (line {})", token, lineNum);
                } else if (globalVariableNames.contains(token)) {
                    tokenType = "variable.user";
                    logger.info(">>> Classifying '{}' as variable.user (line {})", token, lineNum);
                } else {
                    tokenType = classifyIdentifier(token);
                }

                lineTokens.add(new SyntaxToken(
                        lineNum, identifierMatcher.start(), lineNum, identifierMatcher.end(),
                        tokenType, token, null));
            }
        }
    }

    private String classifyIdentifier(String token) {
        if (TRIVIL_KEYWORDS.contains(token)) {
            return TokenType.KEYWORD.name();
        }
        if (BUILT_IN_TYPES.contains(token)) {
            return TokenType.BUILT_IN_TYPE.name();
        }
        if (BUILT_IN_FUNCTIONS.contains(token)) {
            return TokenType.BUILT_IN_FUNCTION.name();
        }
        return TokenType.IDENTIFIER.name();
    }

    private boolean isInStringLiteral(int position, List<int[]> stringRanges) {
        return stringRanges.stream()
                .anyMatch(range -> position >= range[0] && position < range[1]);
    }

    private void parseASTForSemanticInfo(String astOutput, Map<String, String> semanticInfo) {
        logger.info("Parsing AST for semantic information...");
        logger.info("AST output length: {}", astOutput.length());
        logger.info("AST preview (last 500000 chars): {}",
                astOutput.length() > 500000 ? "..." + astOutput.substring(astOutput.length() - 500000) : astOutput);

        String userCodeSection = extractUserCodeFromAST(astOutput);
        logger.info("User code section extracted, length: {}", userCodeSection.length());

        if (userCodeSection.isEmpty()) {
            logger.warn("Could not identify user module from AST output");
            logger.warn("AST contains Execute marker: {}", astOutput.contains("Execute:"));
            logger.warn("AST contains Module: {}", astOutput.contains("(Module"));
            logger.warn("AST contains EntryFn: {}", astOutput.contains("(EntryFn"));
            return;
        } else {
            logger.info("User code section preview (first 2000 chars): {}",
                    userCodeSection.length() > 2000 ? userCodeSection.substring(0, 2000) + "..." : userCodeSection);
        }

        Pattern userFuncPattern = Pattern.compile("\\(Function \"([^\"]+)\" \"functype\"(?!.*External)");
        Matcher userFuncMatcher = userFuncPattern.matcher(userCodeSection);
        while (userFuncMatcher.find()) {
            String functionName = userFuncMatcher.group(1);

            if (!functionName.startsWith("tri_") && !functionName.startsWith("sysapi_") &&
                    !functionName.equals("строка") && !functionName.equals("кс") && !functionName.equals("цел64") &&
                    !functionName.equals("ф") && functionName.length() > 1) {
                semanticInfo.put(functionName, "USER_FUNCTION");
                logger.debug("Found user function: {}", functionName);
            }
        }

        Pattern importPattern = Pattern.compile("\\(Import \"([^\"]+)\"");
        Matcher importMatcher = importPattern.matcher(userCodeSection);
        while (importMatcher.find()) {
            String importPath = importMatcher.group(1);

            String[] parts = importPath.split("::");
            if (parts.length > 1) {
                String moduleName = parts[parts.length - 1];
                semanticInfo.put(moduleName, "IMPORTED_CLASS:" + importPath);
                logger.debug("Found imported class: {} from {}", moduleName, importPath);
            }
        }

        Pattern varDeclPattern = Pattern.compile("\\(VarDecl \"([^\"]+)\" \"([^\"]*?)\"");
        Matcher varMatcher = varDeclPattern.matcher(userCodeSection);
        while (varMatcher.find()) {
            String varName = varMatcher.group(1);
            String varType = varMatcher.group(2);
            if (!TRIVIL_KEYWORDS.contains(varName) && varName.length() > 1) {
                semanticInfo.put(varName, "USER_VARIABLE:" + varType);
                logger.debug("Found user variable: {} of type {}", varName, varType);
            }
        }

        Set<String> foundParams = new HashSet<>();

        Pattern paramPattern = Pattern.compile("\\(IdentExpr \"[^\"]+\" \"([^\"]+)\"\\)");
        Matcher paramMatcher = paramPattern.matcher(userCodeSection);

        while (paramMatcher.find()) {
            String paramName = paramMatcher.group(1);

            if (!TRIVIL_KEYWORDS.contains(paramName) &&
                    !BUILT_IN_TYPES.contains(paramName) &&
                    !semanticInfo.containsKey(paramName) &&
                    !paramName.equals("RO") &&
                    paramName.length() >= 1 && paramName.length() <= 10 &&
                    Character.isLetter(paramName.charAt(0)) &&
                    !foundParams.contains(paramName)) {

                String beforeParam = userCodeSection.substring(0, paramMatcher.start());
                if (!beforeParam.contains("(Function \"" + paramName + "\" \"functype\"")) {
                    semanticInfo.put(paramName, "FUNCTION_PARAMETER");
                    foundParams.add(paramName);
                    logger.debug("Found function parameter: {}", paramName);
                }
            }
        }

        Pattern selectorPattern = Pattern.compile("\\(SelectorExpr \"functype\" \"([^\"]+)\"\\)");
        Matcher selectorMatcher = selectorPattern.matcher(userCodeSection);
        while (selectorMatcher.find()) {
            String methodName = selectorMatcher.group(1);

            if (!semanticInfo.containsKey(methodName) && !TRIVIL_KEYWORDS.contains(methodName)) {
                semanticInfo.put(methodName, "IMPORTED_METHOD");
                logger.debug("Found imported method: {}", methodName);
            }
        }

        Pattern userCallPattern = Pattern
                .compile("\\(CallExpr \"нет результата\" \\(IdentExpr \"functype\" RO \"([^\"]+)\"\\)");
        Matcher userCallMatcher = userCallPattern.matcher(userCodeSection);
        while (userCallMatcher.find()) {
            String calledFunc = userCallMatcher.group(1);
            if (!semanticInfo.containsKey(calledFunc) && !calledFunc.startsWith("std") &&
                    calledFunc.length() > 1 && !TRIVIL_KEYWORDS.contains(calledFunc)) {

                if (userCodeSection.contains("(Function \"" + calledFunc + "\" \"functype\"")) {
                    semanticInfo.put(calledFunc, "USER_FUNCTION");
                    logger.debug("Found user function call: {}", calledFunc);
                }
            }
        }

        Pattern extFuncPattern = Pattern.compile("\\(Function \"([^\"]+)\" \"functype\"[^\\(]*External");
        Matcher extFuncMatcher = extFuncPattern.matcher(astOutput);
        while (extFuncMatcher.find()) {
            String functionName = extFuncMatcher.group(1);
            if (!semanticInfo.containsKey(functionName)) {
                semanticInfo.put(functionName, "IMPORTED_FUNCTION");
                logger.debug("Found imported function: {}", functionName);
            }
        }

        Pattern varUsagePattern = Pattern.compile("\\(IdentExpr\\s+\"[^\"]*\"\\s+\"([^\"]+)\"\\)(?!\\s*\\))");
        Matcher varUsageMatcher = varUsagePattern.matcher(userCodeSection);
        while (varUsageMatcher.find()) {
            String identifier = varUsageMatcher.group(1);

            if (!semanticInfo.containsKey(identifier) && !TRIVIL_KEYWORDS.contains(identifier) &&
                    !BUILT_IN_TYPES.contains(identifier) && identifier.length() > 1) {

                if (userCodeSection.contains("(VarDecl \"" + identifier + "\"") ||
                        userCodeSection.contains("= " + identifier) ||
                        userCodeSection.contains(identifier + " =")) {
                    semanticInfo.put(identifier, "USER_VARIABLE");
                    logger.debug("Found user variable from usage: {}", identifier);
                }
            }
        }

        logger.info("AST parsing completed. Found {} semantic entries", semanticInfo.size());
    }

    private String extractUserCodeFromAST(String astOutput) {

        String userModule = "";
        String lastModuleName = "";

        int executeIndex = astOutput.lastIndexOf("Execute:");
        if (executeIndex > 0) {
            String beforeExecute = astOutput.substring(0, executeIndex).trim();

            int lastModuleStart = beforeExecute.lastIndexOf("(Module \"");
            if (lastModuleStart >= 0) {

                userModule = astOutput.substring(lastModuleStart, executeIndex).trim();

                Pattern moduleNamePattern = Pattern.compile("\\(Module \"([^\"]+)\"");
                Matcher moduleNameMatcher = moduleNamePattern.matcher(userModule);
                if (moduleNameMatcher.find()) {
                    lastModuleName = moduleNameMatcher.group(1);
                    logger.info("Found user module '{}' before Execute marker ({} chars)", lastModuleName,
                            userModule.length());
                }
            }
        }

        if (userModule.isEmpty()) {

            int entryFnIndex = astOutput.indexOf("(EntryFn");
            if (entryFnIndex >= 0) {

                String beforeEntryFn = astOutput.substring(0, entryFnIndex);
                int moduleStart = beforeEntryFn.lastIndexOf("(Module \"");

                if (moduleStart >= 0) {

                    int moduleEnd = astOutput.indexOf("Execute:", entryFnIndex);
                    if (moduleEnd < 0)
                        moduleEnd = astOutput.length();

                    userModule = astOutput.substring(moduleStart, moduleEnd).trim();

                    Pattern moduleNamePattern = Pattern.compile("\\(Module \"([^\"]+)\"");
                    Matcher moduleNameMatcher = moduleNamePattern.matcher(userModule);
                    if (moduleNameMatcher.find()) {
                        lastModuleName = moduleNameMatcher.group(1);
                        logger.info("Found user module '{}' with EntryFn ({} chars)", lastModuleName,
                                userModule.length());
                    }
                }
            }
        }

        if (userModule.isEmpty()) {

            Pattern allModulesPattern = Pattern.compile("\\(Module \"([^\"]+)\"");
            Matcher allModulesMatcher = allModulesPattern.matcher(astOutput);
            String lastUserModuleName = null;
            int lastUserModuleIndex = -1;

            while (allModulesMatcher.find()) {
                String moduleName = allModulesMatcher.group(1);

                if (!moduleName.startsWith("стд::") &&
                        !moduleName.startsWith("sys::") &&
                        !moduleName.startsWith("runtime::") &&
                        !moduleName.equals("builtin") &&
                        !moduleName.equals("core") &&
                        !moduleName.equals("system")) {

                    lastUserModuleName = moduleName;
                    lastUserModuleIndex = allModulesMatcher.start();
                }
            }

            if (lastUserModuleName != null && lastUserModuleIndex >= 0) {

                int moduleEnd = astOutput.indexOf("Execute:", lastUserModuleIndex);
                if (moduleEnd < 0)
                    moduleEnd = astOutput.length();

                userModule = astOutput.substring(lastUserModuleIndex, moduleEnd).trim();
                lastModuleName = lastUserModuleName;
                logger.info("Found user module '{}' dynamically ({} chars)", lastUserModuleName, userModule.length());
            }
        }

        if (userModule.isEmpty()) {
            logger.warn("Could not identify user module, using last 2000 characters");
            int startPos = Math.max(0, astOutput.length() - 2000);
            userModule = astOutput.substring(startPos);
            lastModuleName = "unknown";
        }

        return userModule;
    }

    private void enhanceTokensWithSemanticInfo(List<SyntaxToken> tokens, Map<String, String> semanticInfo) {
        logger.info("Enhancing {} tokens with semantic information...", tokens.size());
        logger.info("Available semantic info: {}", semanticInfo);

        for (int i = 0; i < tokens.size(); i++) {
            SyntaxToken token = tokens.get(i);
            String tokenText = token.value();
            String originalType = token.tokenType();

            if (semanticInfo.containsKey(tokenText)) {
                String semanticType = semanticInfo.get(tokenText);
                String newType = mapSemanticTypeToTokenType(semanticType);

                SyntaxToken enhancedToken = new SyntaxToken(
                        token.startLine(), token.startColumn(),
                        token.endLine(), token.endColumn(),
                        newType, token.value(), semanticType);

                tokens.set(i, enhancedToken);
                logger.info("✅ ENHANCED token '{}': {} -> {} (semantic: {})",
                        tokenText, originalType, newType, semanticType);
            } else {

                String improvedType = improveBasicTokenType(token, tokenText);
                if (!improvedType.equals(originalType)) {
                    SyntaxToken improvedToken = new SyntaxToken(
                            token.startLine(), token.startColumn(),
                            token.endLine(), token.endColumn(),
                            improvedType, token.value(), null);
                    tokens.set(i, improvedToken);
                    logger.info("✅ IMPROVED token '{}': {} -> {}", tokenText, originalType, improvedType);
                } else {
                    logger.debug("⚪ NO CHANGE for token '{}': {} (no semantic info)", tokenText, originalType);
                }
            }
        }

        logger.info("Token enhancement completed");
    }

    private String mapSemanticTypeToTokenType(String semanticType) {
        return switch (semanticType) {
            case "USER_FUNCTION", "USER_FUNCTION_CALL" -> "function.user";
            case "USER_VARIABLE" -> "variable.user";
            case "FUNCTION_PARAMETER" -> "variable.parameter";
            case "IMPORTED_CLASS" -> "class.imported";
            case "IMPORTED_METHOD", "IMPORTED_FUNCTION" -> "function.imported";
            default -> {

                if (semanticType.startsWith("USER_VARIABLE:")) {
                    yield "variable.user";
                } else if (semanticType.startsWith("FUNCTION_PARAMETER:")) {
                    yield "variable.parameter";
                } else if (semanticType.startsWith("IMPORTED_CLASS:")) {
                    yield "class.imported";
                } else {
                    yield "identifier";
                }
            }
        };
    }

    private String improveBasicTokenType(SyntaxToken token, String tokenText) {

        if (TRIVIL_KEYWORDS.contains(tokenText)) {
            return "keyword";
        }

        if (tokenText.matches("Цел64|Строка|Булев|Плав64")) {
            return "type.builtin";
        }

        return token.tokenType();
    }

    private String sanitizeInput(String input) {
        if (input == null)
            return "";

        return input.replaceAll("\0", "")
                .replaceAll("\r\n", "\n")
                .replaceAll("\r", "\n");
    }

    private void cleanupDirectory(Path directory) {
        try {
            if (Files.exists(directory)) {
                Files.walk(directory)
                        .sorted(java.util.Comparator.reverseOrder())
                        .forEach(path -> {
                            try {
                                Files.delete(path);
                            } catch (Exception e) {
                                logger.warn("Failed to delete: {}", path, e);
                            }
                        });
                logger.debug("Cleaned up isolated directory: {}", directory);
            }
        } catch (Exception e) {
            logger.warn("Failed to cleanup directory: {}", directory, e);
        }
    }
}