package com.trivil.playground.controller;

import com.trivil.playground.dto.SyntaxAnalysisRequest;
import com.trivil.playground.dto.SyntaxAnalysisResponse;
import com.trivil.playground.service.TrivilSyntaxAnalysisService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/syntax")
@Validated
public class SyntaxAnalysisController {
    
    private static final Logger logger = LoggerFactory.getLogger(SyntaxAnalysisController.class);
    
    private final TrivilSyntaxAnalysisService syntaxAnalysisService;
    
    public SyntaxAnalysisController(TrivilSyntaxAnalysisService syntaxAnalysisService) {
        this.syntaxAnalysisService = syntaxAnalysisService;
    }
    
    @PostMapping("/analyze")
    public ResponseEntity<SyntaxAnalysisResponse> analyzeSyntax(@Valid @RequestBody SyntaxAnalysisRequest request) {
        try {
            logger.debug("Received syntax analysis request for {} characters", 
                request.sourceCode().length());
            
            SyntaxAnalysisResponse response = syntaxAnalysisService.analyzeSyntax(request);
            
            logger.debug("Syntax analysis completed: success={}, tokens={}", 
                response.success(), response.tokens().size());
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            logger.error("Unexpected error during syntax analysis", e);
            return ResponseEntity.internalServerError()
                .body(SyntaxAnalysisResponse.error("Internal server error: " + e.getMessage(), 0));
        }
    }
    
    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("Syntax analysis service is running");
    }
} 