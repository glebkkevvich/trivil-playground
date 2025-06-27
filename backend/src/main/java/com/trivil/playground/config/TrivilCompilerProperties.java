package com.trivil.playground.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

@ConfigurationProperties(prefix = "trivil.compiler")
@Validated
public record TrivilCompilerProperties(
    @NotBlank
    String compilerPath,
    
    @NotBlank
    String tempDirectory,
    
    @Positive
    Long compilationTimeoutMs,
    
    @Positive
    Long executionTimeoutMs,
    
    @Positive
    Integer maxSourceCodeLength,
    
    @Positive
    Integer maxOutputLength
) {
    
    public TrivilCompilerProperties() {
        this(
            "/app/compiler/v0.79/trivil",
            "/app/temp",
            300000L,
            10000L,
            10000,
            50000
        );
    }
} 