package com.trivil.playground.service;

import com.trivil.playground.config.TrivilCompilerProperties;
import com.trivil.playground.dto.CompileResponse;
import com.trivil.playground.exception.CompilationException;
import com.trivil.playground.exception.ExecutionException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.concurrent.TimeUnit;
import java.util.UUID;

@Service
public class TrivilCompilerService {

    private static final Logger logger = LoggerFactory.getLogger(TrivilCompilerService.class);
    
    private final TrivilCompilerProperties properties;
    
    public TrivilCompilerService(TrivilCompilerProperties properties) {
        this.properties = properties;
    }
    
    public CompileResponse compileAndExecute(String sourceCode) {

        if (sourceCode == null || sourceCode.trim().isEmpty()) {
            return CompileResponse.compilationError("Source code cannot be empty");
        }
        
        if (sourceCode.length() > properties.maxSourceCodeLength()) {
            return CompileResponse.compilationError(
                "Source code exceeds maximum length of " + properties.maxSourceCodeLength() + " characters"
            );
        }
        

        String sessionId = UUID.randomUUID().toString().substring(0, 8);
        String sourceFileName = "temp_" + sessionId + ".tri";
        String executableName = "temp_" + sessionId;
        
        Path tempDir = Path.of(properties.tempDirectory());
        Path sourceFile = tempDir.resolve(sourceFileName);
        Path executableFile = tempDir.resolve(executableName);
        
        long startTime = System.currentTimeMillis();
        
        try {

            Files.createDirectories(tempDir);
            

            cleanupAllTempFiles(tempDir);
            

            writeSourceFile(sourceFile, sourceCode);
            logger.info("Created temporary source file: {}", sourceFile);
            

            CompileResult compileResult = compileSource(sourceFile, executableFile);
            if (!compileResult.success()) {

                return CompileResponse.compilationError(compileResult.output());
            }
            

            ExecutionResult executionResult = executeProgram(sourceFile);
            long executionTime = System.currentTimeMillis() - startTime;
            
            if (executionResult.success()) {

                return CompileResponse.success(executionResult.output(), executionTime);
            } else {

                return CompileResponse.runtimeError(executionResult.output(), executionTime);
            }
            
        } catch (CompilationException e) {
            logger.error("Compilation failed for session {}: {}", sessionId, e.getMessage());
            return CompileResponse.compilationError(e.getMessage());
        } catch (ExecutionException e) {
            long executionTime = System.currentTimeMillis() - startTime;
            logger.error("Execution failed for session {}: {}", sessionId, e.getMessage());
            return CompileResponse.runtimeError(e.getMessage(), executionTime);
        } catch (Exception e) {
            logger.error("Unexpected error for session {}: {}", sessionId, e.getMessage(), e);
            return CompileResponse.compilationError("Internal server error: " + e.getMessage());
        } finally {

            cleanupFiles(sourceFile, executableFile);
        }
    }
    
    private void writeSourceFile(Path sourceFile, String sourceCode) throws IOException {
        Files.writeString(sourceFile, sourceCode, StandardOpenOption.CREATE, StandardOpenOption.WRITE);
    }
    
    private CompileResult compileSource(Path sourceFile, Path executableFile) throws CompilationException {
        try {
            String compilerPath = properties.compilerPath();
            

            ProcessBuilder processBuilder = new ProcessBuilder(
                compilerPath,
                sourceFile.getFileName().toString()
            );
            

            processBuilder.directory(sourceFile.getParent().toFile());
            processBuilder.redirectErrorStream(true);
            
            logger.info("Executing compiler: {} {}", compilerPath, sourceFile);
            
            Process process = processBuilder.start();
            

            boolean finished = process.waitFor(properties.compilationTimeoutMs(), TimeUnit.MILLISECONDS);
            
            if (!finished) {
                process.destroyForcibly();
                throw new CompilationException("Compilation timeout exceeded");
            }
            

            String output = readProcessOutput(process);
            int exitCode = process.exitValue();
            

            String baseName = sourceFile.getFileName().toString().replaceFirst("\\.tri$", "");
            Path tempDir = sourceFile.getParent();
            

            try {
                logger.info("Files in temp directory after compilation:");
                Files.list(tempDir).forEach(file -> logger.info("  - {}", file.getFileName()));
            } catch (IOException e) {
                logger.error("Could not list temp directory contents");
            }
            
            boolean executableExists = Files.exists(tempDir.resolve(baseName)) || 
                                     Files.exists(tempDir.resolve(baseName + ".exe")) ||
                                     Files.exists(tempDir.resolve("privet")) ||
                                     Files.exists(tempDir.resolve("privet.exe")) ||
                                     Files.exists(tempDir.resolve("a.out"));
            

            boolean compilationSuccessful = exitCode == 0 && (output.contains("Без ошибок") || executableExists);
            boolean success = compilationSuccessful;
            
            logger.info("Compilation finished with exit code: {}, executable exists: {}, overall success: {}", 
                       exitCode, executableExists, success);
            
            return new CompileResult(success, output);
            
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new CompilationException("Failed to execute compiler: " + e.getMessage(), e);
        }
    }
    

    
    private ExecutionResult executeProgram(Path sourceFile) throws ExecutionException {
        String baseName = sourceFile.getFileName().toString().replaceFirst("\\.tri$", "");
        Path tempDir = sourceFile.getParent();
        

        Path[] possibleExecutables = {
            tempDir.resolve(baseName + ".exe"),
            tempDir.resolve(baseName)
        };
        
        Path executable = null;
        

        for (Path path : possibleExecutables) {
            if (Files.exists(path)) {
                executable = path;
                logger.info("Found executable: {}", executable);
                break;
            }
        }
        

        if (executable == null) {
            try {
                logger.info("Predefined executables not found. Scanning temp directory for any executable...");
                executable = Files.list(tempDir)
                    .filter(file -> {
                        String fileName = file.getFileName().toString();
                        return (fileName.endsWith(".exe") || 
                               (!fileName.contains(".") && !fileName.startsWith("_") && !fileName.equals("api_test.json"))) &&
                               Files.isRegularFile(file) &&
                               !fileName.equals(sourceFile.getFileName().toString());
                    })
                    .findFirst()
                    .orElse(null);
                    
                if (executable != null) {
                    logger.info("Found executable by scanning: {}", executable);
                }
            } catch (IOException e) {
                logger.error("Failed to scan temp directory: {}", e.getMessage());
            }
        }
        
        if (executable == null) {
            try {
                logger.error("Executable not found. Files in temp directory:");
                Files.list(tempDir).forEach(file -> logger.error("  - {}", file.getFileName()));
            } catch (IOException e) {
                logger.error("Could not list temp directory contents");
            }
            throw new ExecutionException("Compiled executable not found. Compilation may have failed silently.");
        }
        
        try {
            ProcessBuilder processBuilder = new ProcessBuilder(executable.toString());
            processBuilder.directory(executable.getParent().toFile());
            processBuilder.redirectErrorStream(true);
            
            logger.info("Executing program: {}", executable);
            
            Process process = processBuilder.start();
            
            boolean finished = process.waitFor(properties.executionTimeoutMs(), TimeUnit.MILLISECONDS);
            
            if (!finished) {
                process.destroyForcibly();
                return new ExecutionResult(false, "Program execution timeout exceeded");
            }
            
            String output = readProcessOutput(process);
            int exitCode = process.exitValue();
            
            if (output.length() > properties.maxOutputLength()) {
                output = output.substring(0, properties.maxOutputLength()) + "\n... (output truncated)";
            }
            
            boolean success = exitCode == 0;
            logger.info("Program execution finished with exit code: {}", exitCode);
            
            return new ExecutionResult(success, output);
            
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ExecutionException("Failed to execute program: " + e.getMessage(), e);
        }
    }
    
    private String readProcessOutput(Process process) throws IOException {
        StringBuilder output = new StringBuilder();
        
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append("\n");
            }
        }
        
        return output.toString().trim();
    }
    
    private void cleanupAllTempFiles(Path tempDir) {
        try {
            if (!Files.exists(tempDir)) {
                return;
            }
            
            logger.info("Cleaning up all temporary files in: {}", tempDir);
            
            Files.list(tempDir)
                .filter(file -> {
                    String fileName = file.getFileName().toString();
                    return fileName.endsWith(".tri") || 
                           fileName.endsWith(".exe") ||
                           fileName.startsWith("temp_") ||
                           fileName.equals("privet") ||
                           fileName.equals("a.out") ||
                           fileName.equals("main");
                })
                .forEach(file -> {
                    try {
                        Files.deleteIfExists(file);
                        logger.debug("Deleted temporary file: {}", file.getFileName());
                    } catch (IOException e) {
                        logger.warn("Failed to delete temporary file {}: {}", file, e.getMessage());
                    }
                });
                
        } catch (IOException e) {
            logger.warn("Failed to list temp directory for cleanup: {}", e.getMessage());
        }
    }

    private void cleanupFiles(Path... files) {
        for (Path file : files) {
            if (file != null && Files.exists(file)) {
                try {
                    if (file.toString().endsWith(".tri")) {
                        String baseName = file.getFileName().toString().replaceFirst("\\.tri$", "");
                        Path tempDir = file.getParent();
                        Files.deleteIfExists(file);
                        Files.deleteIfExists(tempDir.resolve(baseName));
                        Files.deleteIfExists(tempDir.resolve(baseName + ".exe"));
                    } else {
                        Files.deleteIfExists(file);
                    }
                    
                    logger.debug("Cleaned up temporary file: {}", file);
                } catch (IOException e) {
                    logger.warn("Failed to clean up temporary file {}: {}", file, e.getMessage());
                }
            }
        }
    }
    
    private record CompileResult(boolean success, String output) {}
    
    private record ExecutionResult(boolean success, String output) {}
} 