export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      gv_camera_zones: {
        Row: {
          camera_id: string
          created_at: string
          id: string
          polygon: Json
          zone_key: string
        }
        Insert: {
          camera_id: string
          created_at?: string
          id?: string
          polygon?: Json
          zone_key: string
        }
        Update: {
          camera_id?: string
          created_at?: string
          id?: string
          polygon?: Json
          zone_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "gv_camera_zones_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "gv_cameras"
            referencedColumns: ["id"]
          },
        ]
      }
      gv_cameras: {
        Row: {
          bridge_token_hash: string | null
          class_key: string | null
          created_at: string
          id: string
          last_seen_at: string | null
          location_kind: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          bridge_token_hash?: string | null
          class_key?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          location_kind?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          bridge_token_hash?: string | null
          class_key?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          location_kind?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      gv_class_sessions: {
        Row: {
          class_key: string
          created_at: string
          day_key: string
          id: string
          meta: Json | null
          period_key: string
          student_count_peak: number
          students_left_after: number
          students_left_during: number
          teacher_confirmed: boolean
          teacher_entered_at: string | null
          teacher_exited_at: string | null
          teacher_scheduled: string | null
          updated_at: string
        }
        Insert: {
          class_key: string
          created_at?: string
          day_key?: string
          id?: string
          meta?: Json | null
          period_key: string
          student_count_peak?: number
          students_left_after?: number
          students_left_during?: number
          teacher_confirmed?: boolean
          teacher_entered_at?: string | null
          teacher_exited_at?: string | null
          teacher_scheduled?: string | null
          updated_at?: string
        }
        Update: {
          class_key?: string
          created_at?: string
          day_key?: string
          id?: string
          meta?: Json | null
          period_key?: string
          student_count_peak?: number
          students_left_after?: number
          students_left_during?: number
          teacher_confirmed?: boolean
          teacher_entered_at?: string | null
          teacher_exited_at?: string | null
          teacher_scheduled?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      gv_events: {
        Row: {
          camera_id: string
          class_key: string | null
          event_type: string
          id: string
          meta: Json | null
          occurred_at: string
          period_key: string | null
          subject_id: string | null
          subject_name: string | null
          subject_type: string
          track_id: string | null
          zone: string | null
        }
        Insert: {
          camera_id: string
          class_key?: string | null
          event_type: string
          id?: string
          meta?: Json | null
          occurred_at?: string
          period_key?: string | null
          subject_id?: string | null
          subject_name?: string | null
          subject_type?: string
          track_id?: string | null
          zone?: string | null
        }
        Update: {
          camera_id?: string
          class_key?: string | null
          event_type?: string
          id?: string
          meta?: Json | null
          occurred_at?: string
          period_key?: string | null
          subject_id?: string | null
          subject_name?: string | null
          subject_type?: string
          track_id?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gv_events_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "gv_cameras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gv_events_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "gv_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      gv_tracks: {
        Row: {
          appearance_sig: Json | null
          camera_id: string
          confidence: number | null
          day_key: string
          ended_at: string | null
          id: string
          last_zone: string | null
          local_track_id: string
          started_at: string
          subject_id: string | null
          subject_name: string | null
          subject_type: string
        }
        Insert: {
          appearance_sig?: Json | null
          camera_id: string
          confidence?: number | null
          day_key?: string
          ended_at?: string | null
          id?: string
          last_zone?: string | null
          local_track_id: string
          started_at?: string
          subject_id?: string | null
          subject_name?: string | null
          subject_type?: string
        }
        Update: {
          appearance_sig?: Json | null
          camera_id?: string
          confidence?: number | null
          day_key?: string
          ended_at?: string | null
          id?: string
          last_zone?: string | null
          local_track_id?: string
          started_at?: string
          subject_id?: string | null
          subject_name?: string | null
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "gv_tracks_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "gv_cameras"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
