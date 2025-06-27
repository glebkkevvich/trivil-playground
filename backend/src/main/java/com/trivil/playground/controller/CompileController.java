package com.trivil.playground.controller;

import com.trivil.playground.dto.CompileRequest;
import com.trivil.playground.dto.CompileResponse;
import com.trivil.playground.service.TrivilCompilerService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api")
@Validated
public class CompileController {

    private static final Logger logger = LoggerFactory.getLogger(CompileController.class);
    
    private final TrivilCompilerService compilerService;
    
    public CompileController(TrivilCompilerService compilerService) {
        this.compilerService = compilerService;
    }
    
    @PostMapping("/compile")
    public ResponseEntity<CompileResponse> compile(@Valid @RequestBody CompileRequest request) {
        logger.info("Received compilation request (length: {} chars)", 
                   request.sourceCode() != null ? request.sourceCode().length() : 0);
        
        try {
            String sanitizedCode = request.sanitizedSourceCode();
            CompileResponse response = compilerService.compileAndExecute(sanitizedCode);
            
            logger.info("Compilation completed - Success: {}, Type: {}", 
                       response.success(), response.resultType());
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            logger.error("Unexpected error during compilation: {}", e.getMessage(), e);
            
            CompileResponse errorResponse = CompileResponse.compilationError(
                "Internal server error: " + e.getMessage()
            );
            
            return ResponseEntity.internalServerError().body(errorResponse);
        }
    }
    
    @GetMapping("/health")
    public ResponseEntity<String> health() {
        try {
            return ResponseEntity.ok("Trivil Playground Backend is healthy");
        } catch (Exception e) {
            logger.error("Health check failed: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().body("Service unhealthy: " + e.getMessage());
        }
    }
    
    @ExceptionHandler(org.springframework.web.bind.MethodArgumentNotValidException.class)
    public ResponseEntity<CompileResponse> handleValidationException(
            org.springframework.web.bind.MethodArgumentNotValidException e) {
        
        StringBuilder errorMessage = new StringBuilder("Validation error: ");
        
        e.getBindingResult().getFieldErrors().forEach(error -> 
            errorMessage.append(error.getField())
                       .append(" - ")
                       .append(error.getDefaultMessage())
                       .append("; ")
        );
        
        logger.warn("Validation error: {}", errorMessage);
        
        CompileResponse response = CompileResponse.compilationError(errorMessage.toString());
        return ResponseEntity.badRequest().body(response);
    }
} 