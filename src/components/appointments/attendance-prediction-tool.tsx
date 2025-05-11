
"use client";

import React, { useState } from 'react';
import { predictPatientAttendance, type PredictPatientAttendanceOutput } from '@/ai/flows/predict-patient-attendance';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Brain, Percent, ScrollText } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface AttendancePredictionToolProps {
  patientId: string;
}

const AttendancePredictionToolComponent = ({ patientId }: AttendancePredictionToolProps) => {
  const [prediction, setPrediction] = useState<PredictPatientAttendanceOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePredictAttendance = async () => {
    setIsLoading(true);
    setError(null);
    setPrediction(null);
    try {
      const result = await predictPatientAttendance({ patientId });
      setPrediction(result);
    } catch (err) {
      console.error("Error predicting attendance:", err);
      setError("No se pudo obtener la predicción. Intente nuevamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const getIndicatorColorClass = (probability: number) => {
    if (probability > 0.7) return '[&>[role=progressbar]]:bg-green-500';
    if (probability > 0.4) return '[&>[role=progressbar]]:bg-yellow-500';
    return '[&>[role=progressbar]]:bg-red-500';
  };

  return (
    <div className="mt-4">
      <Button onClick={handlePredictAttendance} disabled={isLoading} variant="outline" size="sm">
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Brain className="mr-2 h-4 w-4" />
        )}
        Predecir Asistencia (IA)
      </Button>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Error de Predicción</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {prediction && (
        <Card className="mt-4 bg-accent/10 border-accent">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Brain className="text-accent"/> Predicción de Asistencia (IA)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <p className="font-medium text-sm flex items-center gap-1"><Percent size={16}/> Probabilidad de Asistencia:</p>
                <span className={`font-bold text-lg ${prediction.attendanceProbability > 0.7 ? 'text-green-600' : prediction.attendanceProbability > 0.4 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {(prediction.attendanceProbability * 100).toFixed(0)}%
                </span>
              </div>
              <Progress 
                value={prediction.attendanceProbability * 100} 
                className={cn("h-2", getIndicatorColorClass(prediction.attendanceProbability))}
              />
            </div>
            <div>
              <p className="font-medium text-sm flex items-center gap-1"><ScrollText size={16}/> Resumen del Historial (IA):</p>
              <p className="text-xs text-muted-foreground p-2 bg-background rounded-md max-h-24 overflow-y-auto">
                {prediction.historySummary || "No se proporcionó resumen."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export const AttendancePredictionTool = React.memo(AttendancePredictionToolComponent);
